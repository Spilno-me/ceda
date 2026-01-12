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
import { EmbeddingService } from './services/embedding.service';
import { VectorStoreService } from './services/vector-store.service';
import { SessionService } from './services/session.service';
import { TenantEmbeddingService } from './services/tenant-embedding.service';
import { bootstrapTenants } from './scripts/bootstrap-tenants';
import { HSE_PATTERNS } from './seed';
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

      // Record in session history
      const confidence = result.prediction?.confidence || 0;
      sessionService.recordPrediction(
        sessionId,
        body.input,
        session.history.length === 0 ? 'signal' : 'refinement',
        result.prediction,
        confidence,
        body.participant,
      );

      console.log(`[CEDA] Complete in ${Date.now() - startTime}ms - Success: ${result.success}`);

      sendJson(res, 200, {
        success: result.success,
        sessionId,
        turn: session.history.length,
        prediction: result.prediction,
        validation: result.validation,
        autoFixed: result.autoFixed,
        appliedFixes: result.appliedFixes,
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

    // 404
    sendJson(res, 404, { error: 'Not found', availableEndpoints: [
      'GET  /health',
      'POST /api/predict',
      'POST /api/refine',
      'GET  /api/session/:id',
      'POST /api/feedback',
      'GET  /api/stats',
      'GET  /api/patterns?user=X',
      'GET  /api/patterns?user=X&company=Y&project=Z',
      'GET  /api/patterns/:id?user=X',
      'POST /api/herald/heartbeat',
      'GET  /api/herald/contexts',
      'POST /api/herald/insight',
      'GET  /api/herald/insights',
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
