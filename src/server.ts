/**
 * CEDA Demo Server
 *
 * Minimal HTTP server to demonstrate the cognitive pipeline.
 * Run: yarn demo
 * Test: curl -X POST http://localhost:3030/api/predict -H "Content-Type: application/json" -d '{"input": "create assessment module"}'
 */

import * as http from 'http';
import 'reflect-metadata';

import { SignalProcessorService } from './services/signal-processor.service';
import { PatternLibraryService, UserPatternQuery } from './services/pattern-library.service';
import { PredictionEngineService } from './services/prediction-engine.service';
import { CognitiveValidationService } from './services/validation.service';
import { CognitiveOrchestratorService } from './services/orchestrator.service';
import { AutoFixService } from './services/auto-fix.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorStoreService } from './services/vector-store.service';
import { SessionService } from './services/session.service';
import { TenantEmbeddingService } from './services/tenant-embedding.service';
import { AntipatternService } from './services/antipattern.service';
import { LegionService, GroundingFeedback, ExecutionResult } from './services/legion.service';
import { bootstrapTenants } from './scripts/bootstrap-tenants';
import { HSE_PATTERNS, SEED_ANTIPATTERNS } from './seed';
import { SessionObservation, DetectRequest, LearnRequest, LearningOutcome } from './interfaces';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Herald context sync - file-based storage for local mode
const HERALD_DATA_PATH = process.env.HERALD_DATA_PATH || path.join(process.cwd(), '.herald');

// Ensure Herald data directory exists
if (!fs.existsSync(HERALD_DATA_PATH)) {
  fs.mkdirSync(HERALD_DATA_PATH, { recursive: true });
}

interface HeraldContext {
  context: string;
  status: string;
  lastHeartbeat: string;
  sessions?: number;
  activeThreads?: string[];
  blockers?: string[];
  pending?: string[];
}

interface HeraldInsight {
  id: string;
  fromContext: string;
  toContext: string;
  topic?: string;
  insight: string;
  timestamp: string;
}

// Simple file-based Herald storage
const heraldStorage = {
  getContextsFile: () => path.join(HERALD_DATA_PATH, 'contexts.json'),
  getInsightsFile: () => path.join(HERALD_DATA_PATH, 'insights.json'),

  loadContexts: (): HeraldContext[] => {
    const file = heraldStorage.getContextsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return [];
  },

  saveContexts: (contexts: HeraldContext[]) => {
    fs.writeFileSync(heraldStorage.getContextsFile(), JSON.stringify(contexts, null, 2));
  },

  loadInsights: (): HeraldInsight[] => {
    const file = heraldStorage.getInsightsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return [];
  },

  saveInsights: (insights: HeraldInsight[]) => {
    fs.writeFileSync(heraldStorage.getInsightsFile(), JSON.stringify(insights, null, 2));
  },
};

// Manual DI - wire up services
const signalProcessor = new SignalProcessorService();
const patternLibrary = new PatternLibraryService();

// Load domain-specific patterns (HSE for this demo)
// In production, patterns would come from database or external config
patternLibrary.loadPatterns(HSE_PATTERNS);

// Initialize embedding and vector store services
const embeddingService = new EmbeddingService();
const vectorStoreService = new VectorStoreService(embeddingService);

const predictionEngine = new PredictionEngineService(patternLibrary);
predictionEngine.setVectorStore(vectorStoreService);

const validationService = new CognitiveValidationService();
const sessionService = new SessionService();

// CEDA-33: Initialize auto-fix service for validation auto-fix pipeline
const autoFixService = new AutoFixService();

// Initialize antipattern service for observation and learning
const antipatternService = new AntipatternService();
antipatternService.loadAntipatterns(SEED_ANTIPATTERNS);

// CEDA-32: Initialize LEGION service for grounding loop (graceful degradation if unavailable)
const legionService = new LegionService();

// Initialize tenant embedding service for AI-native multi-tenancy
const tenantEmbeddingService = new TenantEmbeddingService(embeddingService, vectorStoreService);

const orchestrator = new CognitiveOrchestratorService(
  signalProcessor,
  patternLibrary,
  predictionEngine,
  validationService,
);

// Configure orchestrator with tenant embedding service for AI-native multi-tenancy
orchestrator.setTenantEmbeddingService(tenantEmbeddingService);

async function initializeVectorStore(): Promise<void> {
  if (!embeddingService.isAvailable()) {
    console.log('[CEDA] Vector search disabled - OPENAI_API_KEY not set');
    return;
  }

  console.log('[CEDA] Initializing vector store...');
  const initialized = await vectorStoreService.initialize();
  
  if (initialized) {
    console.log('[CEDA] Seeding patterns to Qdrant...');
    const seeded = await vectorStoreService.seedPatterns(HSE_PATTERNS);
    if (seeded) {
      console.log(`[CEDA] Vector store ready with ${vectorStoreService.getPatternCount()} patterns`);
    } else {
      console.warn('[CEDA] Failed to seed patterns - vector search may not work');
    }

    // Initialize tenants collection for AI-native multi-tenancy
    console.log('[CEDA] Initializing tenants collection...');
    const tenantsInitialized = await vectorStoreService.ensureTenantsCollection();
    if (tenantsInitialized) {
      console.log('[CEDA] Tenants collection ready');
      
      // Bootstrap initial tenants (goprint, disrupt, spilno)
      console.log('[CEDA] Bootstrapping initial tenants...');
      await bootstrapTenants(tenantEmbeddingService);
      console.log('[CEDA] AI-native multi-tenancy initialized');
    } else {
      console.warn('[CEDA] Failed to initialize tenants collection');
    }
  } else {
    console.warn('[CEDA] Failed to initialize vector store - falling back to rule-based matching');
  }
}

const PORT = process.env.PORT || 3030;

interface PredictRequest {
  input: string;
  context?: Array<{ type: string; value: unknown; source: string }>;
  config?: {
    enableAutoFix?: boolean;
    maxAutoFixAttempts?: number;
  };
  /** Session ID for multi-turn conversations */
  sessionId?: string;
  /** Participant identifier (for 5 hats model) */
  participant?: string;
  /** Company identifier for multi-tenant pattern isolation */
  company?: string;
  /** Project identifier for multi-tenant pattern isolation */
  project?: string;
  /** User identifier for multi-tenant pattern isolation */
  user?: string;
}

interface RefineRequest {
  /** Session ID to refine */
  sessionId: string;
  /** Refinement instruction (e.g., "make it OSHA compliant") */
  refinement: string;
  /** Additional context for refinement */
  context?: Array<{ type: string; value: unknown; source: string }>;
  /** Participant identifier */
  participant?: string;
  /** Company identifier for multi-tenant pattern isolation */
  company?: string;
  /** Project identifier for multi-tenant pattern isolation */
  project?: string;
  /** User identifier for multi-tenant pattern isolation */
  user?: string;
}

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Request handler
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check
    if (url === '/health' && method === 'GET') {
      const health = orchestrator.getHealthStatus();
      sendJson(res, 200, {
        status: 'ok',
        service: 'ceda-demo',
        ...health,
      });
      return;
    }

    // Main prediction endpoint
    if (url === '/api/predict' && method === 'POST') {
      const body = await parseBody<PredictRequest>(req);

      if (!body.input) {
        sendJson(res, 400, { error: 'Missing required field: input' });
        return;
      }

      // CEDA-30: Company is required for multi-tenant pattern isolation
      if (!body.company) {
        sendJson(res, 400, { 
          error: 'Missing required field: company',
          message: 'Multi-tenant pattern isolation requires company context',
        });
        return;
      }

      // Generate or use provided session ID
      const sessionId = body.sessionId || randomUUID();
      const session = sessionService.getOrCreate(sessionId, body.input);

      // Accumulate context from request + session
      const requestContext = (body.context || []).map((c) => ({
        ...c,
        timestamp: new Date(),
      }));
      const accumulatedContext = [...sessionService.getAccumulatedContext(sessionId), ...requestContext];

      // Add new context to session
      for (const ctx of requestContext) {
        sessionService.addContext(sessionId, ctx);
      }

      // For multi-turn, combine original signal with any refinements
      const effectiveSignal = session.history.length > 0
        ? sessionService.getCombinedSignal(sessionId) + '. ' + body.input
        : body.input;

      console.log(`\n[CEDA] Processing: "${body.input}" (session: ${sessionId}, turn: ${session.history.length + 1})`);
      const startTime = Date.now();

      // Build tenant context from request body for multi-tenant pattern isolation
      const tenantContext = (body.company || body.project || body.user)
        ? { company: body.company, project: body.project, user: body.user }
        : undefined;

      const result = await orchestrator.execute(effectiveSignal, accumulatedContext, body.config, tenantContext);

      // CEDA-33: Apply auto-fix pipeline with safe/unsafe categorization
      let finalPrediction = result.prediction;
      let autoFixResult = { applied: [], suggested: [], remaining: [] } as {
        applied: { id?: string; type: string; target: string; value: unknown; safe?: boolean; description?: string; errorCode?: string }[];
        suggested: { id?: string; type: string; target: string; value: unknown; safe?: boolean; description?: string; errorCode?: string }[];
        remaining: { code: string; field?: string; message: string; severity: 'error' }[];
      };

      if (result.validation && !result.validation.valid && result.prediction) {
        const fixResult = await autoFixService.fix(result.prediction, result.validation.errors);
        finalPrediction = fixResult.prediction;
        autoFixResult = fixResult.result;
        console.log(`[CEDA] Auto-fix applied: ${autoFixResult.applied.length} safe fixes, ${autoFixResult.suggested.length} suggestions, ${autoFixResult.remaining.length} remaining`);
      }

      // Record in session history
      const confidence = finalPrediction?.confidence || 0;
      sessionService.recordPrediction(
        sessionId,
        body.input,
        session.history.length === 0 ? 'signal' : 'refinement',
        finalPrediction,
        confidence,
        body.participant,
      );

      console.log(`[CEDA] Complete in ${Date.now() - startTime}ms - Success: ${result.success}`);

      sendJson(res, 200, {
        success: result.success,
        sessionId,
        turn: session.history.length,
        prediction: finalPrediction,
        validation: result.validation,
        autoFixed: result.autoFixed || autoFixResult.applied.length > 0,
        appliedFixes: result.appliedFixes,
        autoFix: {
          applied: autoFixResult.applied,
          suggested: autoFixResult.suggested,
          remaining: autoFixResult.remaining,
        },
        processingTime: result.processingTime,
        stages: result.stages,
        session: sessionService.getSummary(sessionId),
      });
      return;
    }

    // Feedback endpoint (simplified for demo)
    if (url === '/api/feedback' && method === 'POST') {
      const body = await parseBody<{
        sessionId: string;
        accepted: boolean;
        comment?: string;
      }>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'Missing required field: sessionId' });
        return;
      }

      // For demo: just acknowledge feedback
      // Full implementation would use submitFeedback with proper types
      console.log(`[CEDA] Feedback for session ${body.sessionId}: ${body.accepted ? 'accepted' : 'rejected'}`);

      sendJson(res, 200, {
        recorded: true,
        sessionId: body.sessionId,
        feedback: body.accepted ? 'positive' : 'negative',
        note: 'Demo mode - feedback acknowledged but not persisted',
      });
      return;
    }

    // CEDA-33: Apply suggested fix endpoint
    if (url === '/api/fix' && method === 'POST') {
      const body = await parseBody<{
        sessionId: string;
        fixId: string;
      }>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'Missing required field: sessionId' });
        return;
      }

      if (!body.fixId) {
        sendJson(res, 400, { error: 'Missing required field: fixId' });
        return;
      }

      const session = sessionService.get(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId: body.sessionId });
        return;
      }

      if (!session.currentPrediction) {
        sendJson(res, 400, { error: 'No prediction in session to fix', sessionId: body.sessionId });
        return;
      }

      console.log(`[CEDA] Applying fix ${body.fixId} to session ${body.sessionId}`);

      const fixResult = autoFixService.applySuggestedFix(body.fixId, session.currentPrediction);

      if (!fixResult.applied) {
        sendJson(res, 404, { 
          error: 'Fix not found or could not be applied', 
          fixId: body.fixId,
          sessionId: body.sessionId,
        });
        return;
      }

      // Update session with fixed prediction
      sessionService.recordPrediction(
        body.sessionId,
        `Applied fix: ${fixResult.fix?.description || body.fixId}`,
        'refinement',
        fixResult.prediction,
        fixResult.prediction.confidence,
      );

      // Re-validate the fixed prediction
      const validation = validationService.validatePrediction(fixResult.prediction);

      sendJson(res, 200, {
        success: true,
        sessionId: body.sessionId,
        fixId: body.fixId,
        applied: true,
        fix: fixResult.fix,
        prediction: fixResult.prediction,
        validation,
        session: sessionService.getSummary(body.sessionId),
      });
      return;
    }

    // Stats endpoint (simplified for demo)
    if (url === '/api/stats' && method === 'GET') {
      const health = orchestrator.getHealthStatus();
      sendJson(res, 200, {
        service: 'ceda-demo',
        patternsLoaded: health.patternsLoaded,
        servicesReady: health.servicesReady,
        activeSessions: sessionService.getActiveSessionCount(),
        note: 'Demo mode - feedback stats not persisted',
      });
      return;
    }

    // Refine endpoint - add refinement to existing session
    if (url === '/api/refine' && method === 'POST') {
      const body = await parseBody<RefineRequest>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'Missing required field: sessionId' });
        return;
      }

      if (!body.refinement) {
        sendJson(res, 400, { error: 'Missing required field: refinement' });
        return;
      }

      const session = sessionService.get(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId: body.sessionId });
        return;
      }

      // Add refinement context
      const requestContext = (body.context || []).map((c) => ({
        ...c,
        timestamp: new Date(),
      }));
      for (const ctx of requestContext) {
        sessionService.addContext(body.sessionId, ctx);
      }

      // Combine original signal + all refinements
      const combinedSignal = sessionService.getCombinedSignal(body.sessionId) + '. ' + body.refinement;
      const accumulatedContext = sessionService.getAccumulatedContext(body.sessionId);

      console.log(`\n[CEDA] Refining: "${body.refinement}" (session: ${body.sessionId}, turn: ${session.history.length + 1})`);
      const startTime = Date.now();

      // Build tenant context from request body for multi-tenant pattern isolation
      const tenantContext = (body.company || body.project || body.user)
        ? { company: body.company, project: body.project, user: body.user }
        : undefined;

      const result = await orchestrator.execute(combinedSignal, accumulatedContext, {}, tenantContext);

      // Record refinement
      const confidence = result.prediction?.confidence || 0;
      sessionService.recordPrediction(
        body.sessionId,
        body.refinement,
        'refinement',
        result.prediction,
        confidence,
        body.participant,
      );

      console.log(`[CEDA] Refinement complete in ${Date.now() - startTime}ms - Success: ${result.success}`);

      sendJson(res, 200, {
        success: result.success,
        sessionId: body.sessionId,
        turn: session.history.length,
        refinement: body.refinement,
        prediction: result.prediction,
        validation: result.validation,
        processingTime: result.processingTime,
        session: sessionService.getSummary(body.sessionId),
      });
      return;
    }

    // Session info endpoint
    if (url?.startsWith('/api/session/') && method === 'GET') {
      const sessionId = url.replace('/api/session/', '');
      const session = sessionService.get(sessionId);

      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId });
        return;
      }

      sendJson(res, 200, {
        sessionId: session.id,
        originalSignal: session.originalSignal,
        turns: session.history.length,
        participants: session.participants,
        currentPrediction: session.currentPrediction,
        history: session.history.map(h => ({
          turn: h.turn,
          input: h.input,
          inputType: h.inputType,
          participant: h.participant,
          confidence: h.confidence,
          timestamp: h.timestamp,
        })),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
      return;
    }

    // CEDA-34: Update session endpoint (for stateless Herald)
    if (url?.startsWith('/api/session/') && method === 'PUT') {
      const sessionId = url.replace('/api/session/', '');
      const body = await parseBody<{
        currentPrediction?: import('./interfaces').StructurePrediction | null;
        context?: import('./interfaces').ContextSignal[];
        participants?: string[];
      }>(req);

      const session = sessionService.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId });
        return;
      }

      const updatedSession = sessionService.update(sessionId, body);
      if (!updatedSession) {
        sendJson(res, 500, { error: 'Failed to update session', sessionId });
        return;
      }

      console.log(`[CEDA] Session updated: ${sessionId}`);

      sendJson(res, 200, {
        updated: true,
        sessionId: updatedSession.id,
        currentPrediction: updatedSession.currentPrediction,
        participants: updatedSession.participants,
        updatedAt: updatedSession.updatedAt,
      });
      return;
    }

    // CEDA-34: Delete session endpoint (for stateless Herald cleanup)
    if (url?.startsWith('/api/session/') && method === 'DELETE') {
      const sessionId = url.replace('/api/session/', '');

      const session = sessionService.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId });
        return;
      }

      const deleted = sessionService.delete(sessionId);
      if (!deleted) {
        sendJson(res, 500, { error: 'Failed to delete session', sessionId });
        return;
      }

      console.log(`[CEDA] Session deleted: ${sessionId}`);

      sendJson(res, 200, {
        deleted: true,
        sessionId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === HERALD CONTEXT SYNC ENDPOINTS ===

    // Herald heartbeat - context reports its status
    if (url === '/api/herald/heartbeat' && method === 'POST') {
      const body = await parseBody<{
        context: string;
        status?: string;
        sessions?: number;
        activeThreads?: string[];
        blockers?: string[];
        pending?: string[];
      }>(req);

      if (!body.context) {
        sendJson(res, 400, { error: 'Missing required field: context' });
        return;
      }

      const contexts = heraldStorage.loadContexts();
      const existingIndex = contexts.findIndex(c => c.context === body.context);

      const contextData: HeraldContext = {
        context: body.context,
        status: body.status || 'active',
        lastHeartbeat: new Date().toISOString(),
        sessions: body.sessions,
        activeThreads: body.activeThreads,
        blockers: body.blockers,
        pending: body.pending,
      };

      if (existingIndex >= 0) {
        contexts[existingIndex] = contextData;
      } else {
        contexts.push(contextData);
      }

      heraldStorage.saveContexts(contexts);
      console.log(`[Herald] Heartbeat from context: ${body.context}`);

      sendJson(res, 200, {
        acknowledged: true,
        context: body.context,
        timestamp: contextData.lastHeartbeat,
      });
      return;
    }

    // Get Herald contexts - discover sibling contexts
    if (url?.startsWith('/api/herald/contexts') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const contextFilter = urlObj.searchParams.get('context');

      let contexts = heraldStorage.loadContexts();

      if (contextFilter) {
        contexts = contexts.filter(c => c.context === contextFilter);
      }

      sendJson(res, 200, {
        contexts,
        count: contexts.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Share insight with a context
    if (url === '/api/herald/insight' && method === 'POST') {
      const body = await parseBody<{
        fromContext?: string;
        toContext: string;
        topic?: string;
        insight: string;
      }>(req);

      if (!body.toContext || !body.insight) {
        sendJson(res, 400, { error: 'Missing required fields: toContext, insight' });
        return;
      }

      const insights = heraldStorage.loadInsights();
      const newInsight: HeraldInsight = {
        id: randomUUID(),
        fromContext: body.fromContext || 'herald',
        toContext: body.toContext,
        topic: body.topic,
        insight: body.insight,
        timestamp: new Date().toISOString(),
      };

      insights.push(newInsight);
      heraldStorage.saveInsights(insights);

      console.log(`[Herald] Insight shared: ${body.fromContext || 'herald'} → ${body.toContext} (${body.topic || 'general'})`);

      sendJson(res, 200, {
        shared: true,
        insightId: newInsight.id,
        timestamp: newInsight.timestamp,
      });
      return;
    }

    // Query insights - get accumulated insights
    if (url?.startsWith('/api/herald/insights') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const topic = urlObj.searchParams.get('topic');
      const context = urlObj.searchParams.get('context');
      const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);

      let insights = heraldStorage.loadInsights();

      // Filter by topic if provided
      if (topic) {
        insights = insights.filter(i =>
          i.topic?.toLowerCase().includes(topic.toLowerCase()) ||
          i.insight.toLowerCase().includes(topic.toLowerCase())
        );
      }

      // Filter by context (insights TO this context)
      if (context) {
        insights = insights.filter(i =>
          i.toContext === context || i.toContext === 'all'
        );
      }

      // Sort by timestamp descending, limit results
      insights = insights
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      sendJson(res, 200, {
        insights,
        count: insights.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-25: User-first Pattern Isolation Endpoints ===

    // GET /api/patterns - Get patterns for a user (user-first isolation)
    // Primary endpoint: GET /api/patterns?user=X
    // Filtered endpoint: GET /api/patterns?user=X&company=Y&project=Z
    if (url?.startsWith('/api/patterns') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // Check if this is GET /api/patterns/:id
      if (pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'patterns') {
        const patternId = pathParts[2];
        const user = urlObj.searchParams.get('user');

        // User is required for pattern access (user-first isolation)
        if (!user) {
          sendJson(res, 400, {
            error: 'Missing required query parameter: user',
            message: 'USER is the doorway - all pattern access requires user context',
          });
          return;
        }

        const query: UserPatternQuery = {
          user,
          company: urlObj.searchParams.get('company') || undefined,
          project: urlObj.searchParams.get('project') || undefined,
        };

        const pattern = patternLibrary.getPatternForUser(patternId, query);

        if (!pattern) {
          sendJson(res, 404, {
            error: 'Pattern not found or not accessible',
            patternId,
            user,
          });
          return;
        }

        sendJson(res, 200, {
          pattern,
          accessedBy: user,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // GET /api/patterns - List patterns for user
      const user = urlObj.searchParams.get('user');

      // User is required for pattern access (user-first isolation)
      if (!user) {
        sendJson(res, 400, {
          error: 'Missing required query parameter: user',
          message: 'USER is the doorway - all pattern access requires user context',
        });
        return;
      }

      const query: UserPatternQuery = {
        user,
        company: urlObj.searchParams.get('company') || undefined,
        project: urlObj.searchParams.get('project') || undefined,
      };

      const patterns = patternLibrary.getPatternsForUser(query);

      sendJson(res, 200, {
        patterns,
        count: patterns.length,
        query: {
          user: query.user,
          company: query.company || null,
          project: query.project || null,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-30: Pattern CRUD Endpoints with Company Scope ===

    // POST /api/patterns - Create a new pattern (requires company)
    if (url === '/api/patterns' && method === 'POST') {
      const body = await parseBody<{
        id: string;
        name: string;
        category: string;
        description: string;
        company: string;
        user: string;
        structure: {
          sections: Array<{ name: string; fieldTypes: string[]; required: boolean }>;
          workflows: string[];
          defaultFields: string[];
        };
        applicabilityRules?: Array<{ field: string; operator: 'equals' | 'contains' | 'matches'; value: string; weight: number }>;
      }>(req);

      // Validate required fields
      if (!body.id || !body.name || !body.category || !body.description || !body.company || !body.user || !body.structure) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['id', 'name', 'category', 'description', 'company', 'user', 'structure'],
        });
        return;
      }

      // Check if pattern already exists
      const existingPattern = patternLibrary.getPattern(body.id);
      if (existingPattern) {
        sendJson(res, 409, {
          error: 'Pattern already exists',
          patternId: body.id,
        });
        return;
      }

      // Create the pattern with company scope
      const newPattern = {
        id: body.id,
        name: body.name,
        category: body.category as import('./interfaces').PatternCategory,
        description: body.description,
        company: body.company,
        user_id: body.user,
        structure: body.structure,
        applicabilityRules: body.applicabilityRules || [],
        confidenceFactors: [],
        metadata: {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 0,
          successRate: 0,
        },
      };

      patternLibrary.registerPattern(newPattern);
      console.log(`[CEDA] Pattern created: ${body.id} for company ${body.company}`);

      sendJson(res, 201, {
        created: true,
        pattern: newPattern,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // PUT /api/patterns/:id - Update a pattern (company-scoped)
    if (url?.startsWith('/api/patterns/') && method === 'PUT') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length !== 3 || pathParts[0] !== 'api' || pathParts[1] !== 'patterns') {
        sendJson(res, 400, { error: 'Invalid URL format' });
        return;
      }

      const patternId = pathParts[2];
      const body = await parseBody<{
        name?: string;
        description?: string;
        company: string;
        user: string;
        structure?: {
          sections: Array<{ name: string; fieldTypes: string[]; required: boolean }>;
          workflows: string[];
          defaultFields: string[];
        };
        applicabilityRules?: Array<{ field: string; operator: 'equals' | 'contains' | 'matches'; value: string; weight: number }>;
      }>(req);

      // Company and user are required for authorization
      if (!body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields: company, user',
          message: 'Company scope is required for pattern updates',
        });
        return;
      }

      // Get existing pattern
      const existingPattern = patternLibrary.getPattern(patternId);
      if (!existingPattern) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId,
        });
        return;
      }

      // Check company scope - pattern must belong to the same company
      if (existingPattern.company && existingPattern.company !== body.company) {
        sendJson(res, 403, {
          error: 'Access denied',
          message: 'Pattern belongs to a different company',
          patternId,
        });
        return;
      }

      // Update the pattern
      const updatedPattern = {
        ...existingPattern,
        name: body.name || existingPattern.name,
        description: body.description || existingPattern.description,
        structure: body.structure || existingPattern.structure,
        applicabilityRules: body.applicabilityRules || existingPattern.applicabilityRules,
        metadata: {
          ...existingPattern.metadata,
          updatedAt: new Date(),
        },
      };

      patternLibrary.registerPattern(updatedPattern);
      console.log(`[CEDA] Pattern updated: ${patternId} by user ${body.user}`);

      sendJson(res, 200, {
        updated: true,
        pattern: updatedPattern,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // DELETE /api/patterns/:id - Delete a pattern (company-scoped)
    if (url?.startsWith('/api/patterns/') && method === 'DELETE') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length !== 3 || pathParts[0] !== 'api' || pathParts[1] !== 'patterns') {
        sendJson(res, 400, { error: 'Invalid URL format' });
        return;
      }

      const patternId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      // Company and user are required for authorization
      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters: company, user',
          message: 'Company scope is required for pattern deletion',
        });
        return;
      }

      // Get existing pattern
      const existingPattern = patternLibrary.getPattern(patternId);
      if (!existingPattern) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId,
        });
        return;
      }

      // Check company scope - pattern must belong to the same company
      if (existingPattern.company && existingPattern.company !== company) {
        sendJson(res, 403, {
          error: 'Access denied',
          message: 'Pattern belongs to a different company',
          patternId,
        });
        return;
      }

      // Delete the pattern (remove from library)
      // Note: PatternLibraryService uses a Map, so we need to add a delete method
      // For now, we'll use the patterns Map directly through a workaround
      const patterns = patternLibrary.getAllPatterns().filter(p => p.id !== patternId);
      patternLibrary.clearPatterns();
      patternLibrary.loadPatterns(patterns);
      
      console.log(`[CEDA] Pattern deleted: ${patternId} by user ${user}`);

      sendJson(res, 200, {
        deleted: true,
        patternId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === ANTIPATTERN OBSERVATION ENDPOINTS ===

    // POST /observe - Receive session observations from Herald
    if (url === '/observe' && method === 'POST') {
      const body = await parseBody<{
        sessionId: string;
        behavior: string;
        context?: string;
        metadata?: Record<string, unknown>;
      }>(req);

      if (!body.sessionId || !body.behavior) {
        sendJson(res, 400, { error: 'Missing required fields: sessionId, behavior' });
        return;
      }

      const observation: SessionObservation = {
        sessionId: body.sessionId,
        timestamp: new Date(),
        behavior: body.behavior,
        context: body.context || '',
        metadata: body.metadata,
      };

      const stored = antipatternService.observe(observation);
      console.log(`[CEDA] Observation recorded: ${stored.id} for session ${body.sessionId}`);

      sendJson(res, 200, {
        recorded: true,
        observationId: stored.id,
        sessionId: body.sessionId,
        timestamp: stored.timestamp,
      });
      return;
    }

    // POST /detect - Check behavior against antipatterns, return matches with confidence
    if (url === '/detect' && method === 'POST') {
      const body = await parseBody<DetectRequest>(req);

      if (!body.behavior) {
        sendJson(res, 400, { error: 'Missing required field: behavior' });
        return;
      }

      const result = antipatternService.detect(body);
      console.log(`[CEDA] Detection complete: ${result.matches.length} antipattern(s) found`);

      sendJson(res, 200, {
        matches: result.matches.map(m => ({
          antipatternId: m.antipattern.id,
          signal: m.antipattern.signal,
          confidence: m.confidence,
          matchedSignals: m.matchedSignals,
          suggestedEscape: m.suggestedEscape,
        })),
        analyzed: result.analyzed,
        timestamp: result.timestamp,
      });
      return;
    }

    // POST /learn - Mark outcome: antipattern_confirmed or paradigm_candidate
    if (url === '/learn' && method === 'POST') {
      const body = await parseBody<{
        antipatternId: string;
        sessionId: string;
        outcome: string;
        feedback?: string;
      }>(req);

      if (!body.antipatternId || !body.sessionId || !body.outcome) {
        sendJson(res, 400, { error: 'Missing required fields: antipatternId, sessionId, outcome' });
        return;
      }

      if (body.outcome !== 'antipattern_confirmed' && body.outcome !== 'paradigm_candidate') {
        sendJson(res, 400, { 
          error: 'Invalid outcome. Must be "antipattern_confirmed" or "paradigm_candidate"',
          validOutcomes: ['antipattern_confirmed', 'paradigm_candidate'],
        });
        return;
      }

      const learnRequest: LearnRequest = {
        antipatternId: body.antipatternId,
        sessionId: body.sessionId,
        outcome: body.outcome as LearningOutcome,
        feedback: body.feedback,
      };

      const result = antipatternService.learn(learnRequest);
      console.log(`[CEDA] Learning recorded: ${body.antipatternId} - ${body.outcome} (confidence: ${result.newConfidence.toFixed(2)})`);

      sendJson(res, 200, {
        updated: result.updated,
        antipatternId: result.antipatternId,
        newConfidence: result.newConfidence,
        outcome: result.outcome,
      });
      return;
    }

    // === CEDA-32: GROUNDING LOOP ENDPOINTS ===

    // POST /api/ground - Receive execution feedback from LEGION
    if (url === '/api/ground' && method === 'POST') {
      const body = await parseBody<{
        session_id: string;
        pattern_id: string;
        accepted: boolean;
        modifications?: Record<string, unknown>[];
        execution_result: ExecutionResult;
      }>(req);

      if (!body.session_id || !body.pattern_id || body.accepted === undefined || !body.execution_result) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['session_id', 'pattern_id', 'accepted', 'execution_result'],
          validExecutionResults: ['success', 'partial', 'failed'],
        });
        return;
      }

      if (!['success', 'partial', 'failed'].includes(body.execution_result)) {
        sendJson(res, 400, {
          error: 'Invalid execution_result',
          validValues: ['success', 'partial', 'failed'],
        });
        return;
      }

      console.log(`[CEDA] Grounding feedback received: session=${body.session_id}, pattern=${body.pattern_id}, accepted=${body.accepted}, result=${body.execution_result}`);

      const success = body.accepted && body.execution_result === 'success';
      const updatedPattern = patternLibrary.groundPattern(body.pattern_id, success);

      if (!updatedPattern) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId: body.pattern_id,
        });
        return;
      }

      const groundingFeedback: GroundingFeedback = {
        sessionId: body.session_id,
        patternId: body.pattern_id,
        accepted: body.accepted,
        modifications: body.modifications,
        executionResult: body.execution_result,
      };
      await legionService.processGroundingFeedback(groundingFeedback);

      const currentConfidence = patternLibrary.currentConfidence(updatedPattern);

      sendJson(res, 200, {
        grounded: true,
        patternId: body.pattern_id,
        sessionId: body.session_id,
        accepted: body.accepted,
        executionResult: body.execution_result,
        patternConfidence: {
          current: currentConfidence,
          groundingCount: updatedPattern.confidence?.groundingCount || 0,
          lastGrounded: updatedPattern.confidence?.lastGrounded || null,
        },
        legionAvailable: legionService.isAvailable(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/patterns/:id/confidence - Get pattern confidence with decay applied
    if (url?.match(/^\/api\/patterns\/[^/]+\/confidence$/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];

      const confidence = patternLibrary.getPatternConfidence(patternId);

      if (confidence === null) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId,
        });
        return;
      }

      const pattern = patternLibrary.getPattern(patternId);

      sendJson(res, 200, {
        patternId,
        confidence: {
          current: confidence,
          base: pattern?.confidence?.base || 1.0,
          groundingCount: pattern?.confidence?.groundingCount || 0,
          lastGrounded: pattern?.confidence?.lastGrounded || null,
          decayRate: pattern?.confidence?.decayRate || 0.01,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 404
    sendJson(res, 404, { error: 'Not found', availableEndpoints: [
      'GET  /health',
      'POST /api/predict (requires company)',
      'POST /api/refine',
      'GET  /api/session/:id',
      'PUT  /api/session/:id (CEDA-34: update session for stateless Herald)',
      'DELETE /api/session/:id (CEDA-34: delete session)',
      'POST /api/feedback',
      'GET  /api/stats',
      'GET  /api/patterns?user=X',
      'GET  /api/patterns?user=X&company=Y&project=Z',
      'GET  /api/patterns/:id?user=X',
      'GET  /api/patterns/:id/confidence (CEDA-32: get pattern confidence with decay)',
      'POST /api/patterns (CEDA-30: create pattern with company scope)',
      'PUT  /api/patterns/:id (CEDA-30: update pattern with company scope)',
      'DELETE /api/patterns/:id?company=X&user=Y (CEDA-30: delete pattern)',
      'POST /api/ground (CEDA-32: receive execution feedback for grounding loop)',
      'POST /api/herald/heartbeat',
      'GET  /api/herald/contexts',
      'POST /api/herald/insight',
      'GET  /api/herald/insights',
      'POST /observe',
      'POST /detect',
      'POST /learn',
    ]});
  } catch (error) {
    console.error('[CEDA] Error:', error);
    sendJson(res, 500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Create and start server
const server = http.createServer(handleRequest);

// Debug: Log all env vars at startup to diagnose Railway injection
console.log('\n[CEDA] === Environment Variables Debug ===');
console.log('[CEDA] NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
console.log('[CEDA] PORT:', process.env.PORT || 'NOT SET');
console.log('[CEDA] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.slice(0, 10)}...` : 'NOT SET');
console.log('[CEDA] QDRANT_URL:', process.env.QDRANT_URL || 'NOT SET');
console.log('[CEDA] VECTOR_URL:', process.env.VECTOR_URL || 'NOT SET');
console.log('[CEDA] QDRANT_API_KEY:', process.env.QDRANT_API_KEY ? 'SET' : 'NOT SET');
console.log('[CEDA] VECTOR_KEY:', process.env.VECTOR_KEY ? 'SET' : 'NOT SET');
console.log('[CEDA] All env var keys:', Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', '));
console.log('[CEDA] ================================\n');

server.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗███████╗██████╗  █████╗                          ║
║  ██╔════╝██╔════╝██╔══██╗██╔══██╗                         ║
║  ██║     █████╗  ██║  ██║███████║                         ║
║  ██║     ██╔══╝  ██║  ██║██╔══██║                         ║
║  ╚██████╗███████╗██████╔╝██║  ██║                         ║
║   ╚═════╝╚══════╝╚═════╝ ╚═╝  ╚═╝                         ║
║                                                           ║
║   Cognitive Event-Driven Architecture                     ║
║   Demo Server v0.1.0                                      ║
║                                                           ║
║   Listening on: http://localhost:${PORT}                    ║
║                                                           ║
║   Endpoints:                                              ║
║   - GET  /health        Health check                      ║
║   - POST /api/predict   Run cognitive pipeline            ║
║   - POST /api/feedback  Record user feedback              ║
║   - GET  /api/stats     Get statistics                    ║
║                                                           ║
║   Herald Context Sync:                                    ║
║   - POST /api/herald/heartbeat   Context status           ║
║   - GET  /api/herald/contexts    Discover contexts        ║
║   - POST /api/herald/insight     Share insight            ║
║   - GET  /api/herald/insights    Query insights           ║
║                                                           ║
║   Antipattern Observation:                                ║
║   - POST /observe    Receive session observations         ║
║   - POST /detect     Check behavior against antipatterns  ║
║   - POST /learn      Mark outcome for learning            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Try: curl -X POST http://localhost:${PORT}/api/predict \\
     -H "Content-Type: application/json" \\
     -d '{"input": "create assessment module"}'
`);

  // Initialize vector store in background (non-blocking)
  initializeVectorStore().catch(err => {
    console.error('[CEDA] Vector store initialization error:', err);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[CEDA] Shutting down...');
  server.close(() => process.exit(0));
});
