/**
 * CEDA Server v1.0.0
 *
 * Cognitive Event-Driven Architecture - AI-native pattern learning.
 * Run: yarn serve
 * Test: curl -X POST http://localhost:3030/api/predict -H "Content-Type: application/json" -d '{"input": "create assessment module", "company": "spilno"}'
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
import { SessionHistoryService } from './services/session-history.service';
import { TenantEmbeddingService } from './services/tenant-embedding.service';
import { AntipatternService } from './services/antipattern.service';
import { LegionService, GroundingFeedback, ExecutionResult } from './services/legion.service';
import { ObservationService } from './services/observation.service';
import { GraduationService } from './services/graduation.service';
import { AbstractionService } from './services/abstraction.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { AuditService } from './services/audit.service';
import { DocumentService } from './services/document.service';
import { QualityScoreService } from './services/quality-score.service';
import { LinkingService } from './services/linking.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { AnalyticsService } from './services/analytics.service';
import { bootstrapTenants } from './scripts/bootstrap-tenants';
import { HSE_PATTERNS, DESIGNSYSTEM_PATTERNS, SALVADOR_PATTERNS, SEED_ANTIPATTERNS, METHODOLOGY_PATTERNS } from './seed';
import { SessionObservation, DetectRequest, LearnRequest, LearningOutcome, CaptureObservationRequest, CreateObservationDto, ObservationOutcome, StructurePrediction, PatternLevel, CreateDocumentDto, UpdateDocumentDto, LinkDocumentDto, DocumentSearchParams, GraphQueryParams, DocumentType, DocumentLinkType, WrapEntityDto, CreateLinkDto, LinkableType, LinkType } from './interfaces';
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

// Meta-learning: Reflection with method tracking
interface HeraldReflection {
  id: string;
  session: string;
  feeling: 'stuck' | 'success';
  insight: string;
  method: 'direct' | 'simulation';
  // AI-extracted fields (from simulation)
  signal?: string;
  outcome?: 'pattern' | 'antipattern';
  reinforcement?: string;
  warning?: string;
  // Context
  company: string;
  project: string;
  user: string;
  // Tracking
  applications: PatternApplication[];
  timestamp: string;
}

interface PatternApplication {
  sessionId: string;
  timestamp: string;
  helped: boolean;
}

interface MetaPattern {
  id: string;
  contextSignal: string;
  recommendedMethod: 'direct' | 'simulation';
  confidence: number;
  evidenceCount: number;
  evidenceIds: string[];
  lastUpdated: string;
}

// Simple file-based Herald storage
const heraldStorage = {
  getContextsFile: () => path.join(HERALD_DATA_PATH, 'contexts.json'),
  getInsightsFile: () => path.join(HERALD_DATA_PATH, 'insights.json'),
  getReflectionsFile: () => path.join(HERALD_DATA_PATH, 'reflections.json'),
  getMetaPatternsFile: () => path.join(HERALD_DATA_PATH, 'meta-patterns.json'),

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

  // Meta-learning: Reflections with method tracking
  loadReflections: (): HeraldReflection[] => {
    const file = heraldStorage.getReflectionsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return [];
  },

  saveReflections: (reflections: HeraldReflection[]) => {
    fs.writeFileSync(heraldStorage.getReflectionsFile(), JSON.stringify(reflections, null, 2));
  },

  // Meta-learning: Meta-patterns (learned weights)
  loadMetaPatterns: (): MetaPattern[] => {
    const file = heraldStorage.getMetaPatternsFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return [];
  },

  saveMetaPatterns: (metaPatterns: MetaPattern[]) => {
    fs.writeFileSync(heraldStorage.getMetaPatternsFile(), JSON.stringify(metaPatterns, null, 2));
  },
};

// Manual DI - wire up services
const signalProcessor = new SignalProcessorService();
const patternLibrary = new PatternLibraryService();

// Load domain-specific patterns
// In production, patterns would come from database or external config
patternLibrary.loadPatterns(HSE_PATTERNS);
patternLibrary.loadPatterns(DESIGNSYSTEM_PATTERNS);
patternLibrary.loadPatterns(SALVADOR_PATTERNS);

// Load methodology patterns (shared/cross-domain) from Five Hats AI Consilium
patternLibrary.loadPatterns(METHODOLOGY_PATTERNS);
console.log(`[CEDA] Loaded ${METHODOLOGY_PATTERNS.length} methodology patterns from AI consilium`);

// Initialize embedding and vector store services
const embeddingService = new EmbeddingService();
const vectorStoreService = new VectorStoreService(embeddingService);

const predictionEngine = new PredictionEngineService(patternLibrary);
predictionEngine.setVectorStore(vectorStoreService);

const validationService = new CognitiveValidationService();
const sessionService = new SessionService();

// CEDA-46: Initialize session history service for version tracking
const sessionHistoryService = new SessionHistoryService();

// CEDA-33: Initialize auto-fix service for validation auto-fix pipeline
const autoFixService = new AutoFixService();

// Initialize antipattern service for observation and learning
const antipatternService = new AntipatternService();
antipatternService.loadAntipatterns(SEED_ANTIPATTERNS);

// CEDA-32: Initialize LEGION service for grounding loop (graceful degradation if unavailable)
const legionService = new LegionService();

// Initialize tenant embedding service for AI-native multi-tenancy
const tenantEmbeddingService = new TenantEmbeddingService(embeddingService, vectorStoreService);

// CEDA-35: Initialize observation service for learning loop
const observationService = new ObservationService(embeddingService);

// CEDA-41: Set pattern creation callback for auto-generated patterns from clustering
observationService.setPatternCreationCallback((pattern) => {
  patternLibrary.registerPattern(pattern);
  console.log(`[CEDA-41] Auto-registered pattern: ${pattern.id} "${pattern.name}"`);
});

// CEDA-36: Initialize graduation service for pattern evolution
const graduationService = new GraduationService(patternLibrary, observationService);

// CEDA-37: Initialize abstraction service for cross-domain learning
const abstractionService = new AbstractionService(patternLibrary, observationService);

// CEDA-43: Initialize rate limiter service for adversarial hardening (100 req/min per company)
const rateLimiterService = new RateLimiterService(100, 60000);

// CEDA-43: Initialize audit service for compliance logging
const auditService = new AuditService();

// CEDA-44: Initialize quality score service for pattern quality assessment
const qualityScoreService = new QualityScoreService();

// CEDA-47: Initialize document service for AI-native knowledge organization
const documentService = new DocumentService(embeddingService);

// CEDA-48: Initialize linking service for bidirectional linking
const linkingService = new LinkingService(patternLibrary, observationService);

// CEDA-52: Initialize anomaly detection service for detecting suspicious patterns
const anomalyDetectionService = new AnomalyDetectionService(patternLibrary, qualityScoreService);

// CEDA-50: Initialize analytics service for dashboard metrics
const analyticsService = new AnalyticsService(
  auditService,
  observationService,
  patternLibrary,
  sessionService,
);
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

    // CEDA-35: Initialize observations collection for learning loop
    console.log('[CEDA] Initializing observations collection...');
    const observationsInitialized = await observationService.initialize();
    if (observationsInitialized) {
      console.log('[CEDA] Observations collection ready');
    } else {
      console.warn('[CEDA] Failed to initialize observations collection');
    }

    // CEDA-43: Initialize audit collection for compliance logging
    console.log('[CEDA] Initializing audit collection...');
    const auditInitialized = await auditService.initialize();
    if (auditInitialized) {
      console.log('[CEDA] Audit collection ready');
    } else {
      console.warn('[CEDA] Failed to initialize audit collection');
    }

    // CEDA-45: Initialize sessions collection for session persistence
    console.log('[CEDA] Initializing sessions collection...');
    const sessionsInitialized = await sessionService.initialize();
    if (sessionsInitialized) {
      console.log('[CEDA] Sessions collection ready');
    } else {
      console.warn('[CEDA] Failed to initialize sessions collection');
    }

    // CEDA-46: Initialize session history collection for version tracking
    console.log('[CEDA] Initializing session history collection...');
    const sessionHistoryInitialized = await sessionHistoryService.initialize();
    if (sessionHistoryInitialized) {
      console.log('[CEDA] Session history collection ready');
    } else {
      console.warn('[CEDA] Failed to initialize session history collection');
    }

    // CEDA-52: Initialize anomalies collection for anomaly detection
    console.log('[CEDA] Initializing anomalies collection...');
    const anomaliesInitialized = await anomalyDetectionService.initialize();
    if (anomaliesInitialized) {
      console.log('[CEDA] Anomalies collection ready');
    } else {
      console.warn('[CEDA] Failed to initialize anomalies collection');
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
 * API Endpoints - single source of truth for /docs and 404 responses
 */
const API_ENDPOINTS = [
  { method: 'GET', path: '/health', description: 'Health check' },
  { method: 'GET', path: '/docs', description: 'API documentation (this page)' },
  { method: 'POST', path: '/api/predict', description: 'Generate structure prediction', params: 'company (required)' },
  { method: 'POST', path: '/api/refine', description: 'Refine existing prediction' },
  { method: 'GET', path: '/api/session/:id', description: 'Get session by ID' },
  { method: 'PUT', path: '/api/session/:id', description: 'Update session', ticket: 'CEDA-34' },
  { method: 'DELETE', path: '/api/session/:id', description: 'Delete session', ticket: 'CEDA-34' },
  { method: 'GET', path: '/api/sessions', description: 'List sessions with filters', params: 'company, limit', ticket: 'CEDA-45' },
  { method: 'POST', path: '/api/sessions/cleanup', description: 'Trigger session cleanup/expiration', ticket: 'CEDA-45' },
  { method: 'POST', path: '/api/feedback', description: 'Submit feedback on prediction' },
  { method: 'GET', path: '/api/stats', description: 'Get system statistics' },
  { method: 'GET', path: '/api/patterns', description: 'Get patterns', params: 'user, company, project' },
  { method: 'GET', path: '/api/patterns/:id', description: 'Get pattern by ID', params: 'user' },
  { method: 'GET', path: '/api/patterns/:id/confidence', description: 'Get pattern confidence with decay', ticket: 'CEDA-32' },
  { method: 'GET', path: '/api/patterns/:id/graduation', description: 'Get graduation status', ticket: 'CEDA-36' },
  { method: 'POST', path: '/api/patterns/:id/check-graduation', description: 'Trigger graduation check', ticket: 'CEDA-36' },
  { method: 'POST', path: '/api/patterns/:id/approve-graduation', description: 'Admin approve graduation', ticket: 'CEDA-36' },
  { method: 'GET', path: '/api/patterns/graduation-candidates', description: 'List graduation candidates', ticket: 'CEDA-36' },
  { method: 'POST', path: '/api/graduation/check-all', description: 'Run daily graduation check', ticket: 'CEDA-36' },
  { method: 'GET', path: '/api/graduation/pending', description: 'Get pending approvals', ticket: 'CEDA-36' },
  { method: 'POST', path: '/api/patterns', description: 'Create pattern with company scope', ticket: 'CEDA-30' },
  { method: 'PUT', path: '/api/patterns/:id', description: 'Update pattern', ticket: 'CEDA-30' },
  { method: 'DELETE', path: '/api/patterns/:id', description: 'Delete pattern', params: 'company, user', ticket: 'CEDA-30' },
  { method: 'POST', path: '/api/ground', description: 'Receive execution feedback for grounding loop', ticket: 'CEDA-32' },
  { method: 'POST', path: '/api/observe', description: 'Capture pattern observation', ticket: 'CEDA-35' },
  { method: 'GET', path: '/api/observations/similar', description: 'Find similar observations', params: 'input, company', ticket: 'CEDA-35' },
  { method: 'GET', path: '/api/observations/pattern/:id/stats', description: 'Pattern observation statistics', ticket: 'CEDA-35' },
  { method: 'GET', path: '/api/observations/:id', description: 'Get observation by ID', ticket: 'CEDA-35' },
  { method: 'GET', path: '/api/abstractions/suggest', description: 'Suggest abstractions for pattern', params: 'patternId', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/insights/cross-domain', description: 'Get cross-domain insights', ticket: 'CEDA-37' },
  { method: 'POST', path: '/api/abstractions/:id/apply', description: 'Apply abstraction to domain', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/abstractions/:id/instances', description: 'Get abstraction instances', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/abstractions/:id', description: 'Get abstraction by ID', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/abstractions', description: 'List all abstractions', ticket: 'CEDA-37' },
  { method: 'POST', path: '/api/abstractions/extract', description: 'Extract abstraction from patterns', ticket: 'CEDA-37' },
  { method: 'POST', path: '/api/insights/generate', description: 'Generate cross-domain insights', ticket: 'CEDA-37' },
  { method: 'POST', path: '/api/insights/:id/approve', description: 'Approve insight', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/abstractions/audit', description: 'Get audit log', ticket: 'CEDA-37' },
  { method: 'GET', path: '/api/abstractions/safety', description: 'Get safety settings', ticket: 'CEDA-37' },
  { method: 'PUT', path: '/api/abstractions/safety', description: 'Update safety settings', ticket: 'CEDA-37' },
  { method: 'POST', path: '/api/clustering/check', description: 'Trigger clustering for company', ticket: 'CEDA-41' },
  { method: 'GET', path: '/api/clustering/orphans', description: 'Get orphan observations', ticket: 'CEDA-41' },
  { method: 'GET', path: '/api/clustering/config', description: 'Get clustering configuration', ticket: 'CEDA-41' },
  { method: 'POST', path: '/api/linking/wrap/:type/:id', description: 'Wrap pattern/observation as linkable node', ticket: 'CEDA-48' },
  { method: 'POST', path: '/api/linking/link', description: 'Create link between entities', ticket: 'CEDA-48' },
  { method: 'GET', path: '/api/patterns/:id/network', description: 'Get pattern network graph', ticket: 'CEDA-48' },
  { method: 'GET', path: '/api/patterns/:id/related', description: 'Get related patterns', ticket: 'CEDA-48' },
  { method: 'GET', path: '/api/linking/stats', description: 'Get linking service statistics', ticket: 'CEDA-48' },
  { method: 'GET', path: '/api/analytics', description: 'Full analytics dashboard', params: 'company, period (day|week|month)', ticket: 'CEDA-50' },
  { method: 'GET', path: '/api/analytics/metrics', description: 'Core metrics', params: 'company, period', ticket: 'CEDA-50' },
  { method: 'GET', path: '/api/analytics/trends', description: 'Trend data', params: 'company, period', ticket: 'CEDA-50' },
  { method: 'GET', path: '/api/analytics/patterns', description: 'Top patterns', params: 'company, period', ticket: 'CEDA-50' },
  { method: 'GET', path: '/api/analytics/users', description: 'Active users', params: 'company, period', ticket: 'CEDA-50' },
  { method: 'GET', path: '/api/analytics/system', description: 'System-wide analytics (admin only)', ticket: 'CEDA-50' },
  { method: 'POST', path: '/api/herald/heartbeat', description: 'Herald context heartbeat' },
  { method: 'GET', path: '/api/herald/contexts', description: 'Get Herald contexts' },
  { method: 'POST', path: '/api/herald/insight', description: 'Share insight' },
  { method: 'GET', path: '/api/herald/insights', description: 'Get insights' },
  { method: 'POST', path: '/api/herald/reflect', description: 'Session reflection for pattern learning' },
  { method: 'POST', path: '/api/herald/reflect/dry-run', description: 'Preview reflection without storing', ticket: 'CEDA-65' },
  { method: 'DELETE', path: '/api/herald/forget', description: 'GDPR Article 17 - Right to erasure' },
  { method: 'GET', path: '/api/herald/export', description: 'GDPR Article 20 - Data portability' },
  { method: 'GET', path: '/api/anomalies', description: 'List anomalies with filtering', ticket: 'CEDA-52' },
  { method: 'POST', path: '/api/anomalies/sweep', description: 'Trigger detection sweep', ticket: 'CEDA-52' },
  { method: 'POST', path: '/api/anomalies/:id/acknowledge', description: 'Acknowledge an anomaly', ticket: 'CEDA-52' },
  { method: 'POST', path: '/api/anomalies/:id/resolve', description: 'Resolve an anomaly', ticket: 'CEDA-52' },
] as const;

/**
 * Render API documentation as HTML
 */
function renderDocsHtml(): string {
  const groupedEndpoints: Record<string, typeof API_ENDPOINTS[number][]> = {};

  for (const endpoint of API_ENDPOINTS) {
    const category = endpoint.path.startsWith('/api/herald') ? 'Herald' :
                     endpoint.path.startsWith('/api/patterns') ? 'Patterns' :
                     endpoint.path.startsWith('/api/session') ? 'Sessions' :
                     endpoint.path.startsWith('/api/observation') ? 'Observations' :
                     endpoint.path.startsWith('/api/abstraction') ? 'Abstractions' :
                     endpoint.path.startsWith('/api/insight') ? 'Insights' :
                     endpoint.path.startsWith('/api/clustering') ? 'Clustering' :
                     endpoint.path.startsWith('/api/linking') ? 'Linking' :
                     endpoint.path.startsWith('/api/analytics') ? 'Analytics' :
                     endpoint.path.startsWith('/api/graduation') ? 'Graduation' :
                     endpoint.path.startsWith('/api/anomal') ? 'Anomalies' :
                     endpoint.path.startsWith('/api/') ? 'Core API' :
                     'System';

    if (!groupedEndpoints[category]) {
      groupedEndpoints[category] = [];
    }
    groupedEndpoints[category].push(endpoint);
  }

  const categoryOrder = ['System', 'Core API', 'Sessions', 'Patterns', 'Graduation', 'Observations',
                         'Abstractions', 'Insights', 'Clustering', 'Linking', 'Analytics', 'Herald', 'Anomalies'];

  let endpointRows = '';
  for (const category of categoryOrder) {
    const endpoints = groupedEndpoints[category];
    if (!endpoints) continue;

    endpointRows += `
      <tr class="category-row">
        <td colspan="5">${category}</td>
      </tr>`;

    for (const ep of endpoints) {
      const methodClass = ep.method.toLowerCase();
      const epAny = ep as { method: string; path: string; description: string; params?: string; ticket?: string };
      endpointRows += `
      <tr>
        <td><span class="method ${methodClass}">${ep.method}</span></td>
        <td class="path"><code>${ep.path}</code></td>
        <td>${ep.description}</td>
        <td class="params">${epAny.params || '-'}</td>
        <td class="ticket">${epAny.ticket ? `<a href="https://github.com/Spilno-me/ceda/issues?q=${epAny.ticket}">${epAny.ticket}</a>` : '-'}</td>
      </tr>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEDA API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #fff; }
    .tagline { color: #888; margin-bottom: 2rem; }
    .format-toggle { margin-bottom: 1.5rem; }
    .format-toggle a { color: #4a9eff; text-decoration: none; margin-right: 1rem; }
    .format-toggle a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
    th { background: #2a2a2a; padding: 0.75rem 1rem; text-align: left; font-weight: 600; color: #fff; }
    td { padding: 0.5rem 1rem; border-top: 1px solid #2a2a2a; }
    .category-row { background: #1f1f1f; }
    .category-row td { font-weight: 600; color: #4a9eff; padding: 0.75rem 1rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; }
    code { background: #2a2a2a; padding: 0.15rem 0.4rem; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.85rem; }
    .path code { background: none; padding: 0; }
    .method { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; min-width: 60px; text-align: center; }
    .get { background: #1e3a5f; color: #61afef; }
    .post { background: #2d4a3e; color: #98c379; }
    .put { background: #4a3f2a; color: #e5c07b; }
    .delete { background: #4a2a2a; color: #e06c75; }
    .params { color: #888; font-size: 0.85rem; }
    .ticket { font-size: 0.85rem; }
    .ticket a { color: #888; text-decoration: none; }
    .ticket a:hover { color: #4a9eff; }
    .footer { text-align: center; color: #666; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #2a2a2a; }
    .footer a { color: #4a9eff; text-decoration: none; }
    @media (max-width: 768px) {
      .params, .ticket { display: none; }
      th:nth-child(4), th:nth-child(5) { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>CEDA API</h1>
    <p class="tagline">Cognitive Event-Driven Architecture - ${API_ENDPOINTS.length} endpoints</p>

    <div class="format-toggle">
      <a href="/docs?format=json">JSON format</a>
      <a href="/">Back to home</a>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 80px">Method</th>
          <th style="width: 300px">Path</th>
          <th>Description</th>
          <th style="width: 150px">Params</th>
          <th style="width: 80px">Ticket</th>
        </tr>
      </thead>
      <tbody>
        ${endpointRows}
      </tbody>
    </table>

    <p class="footer">
      <a href="https://github.com/Spilno-me/ceda">GitHub</a> ·
      <a href="https://www.npmjs.com/package/@spilno/herald-mcp">Herald MCP</a> ·
      Built by Spilno
    </p>
  </div>
</body>
</html>`;
}

/**
 * CEDA-43: Extract client IP from request headers
 */
function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * CEDA-43: Check rate limit and send 429 response if exceeded
 * Returns true if request should be blocked
 */
async function checkRateLimitAndRespond(
  company: string,
  res: http.ServerResponse,
): Promise<boolean> {
  const result = await rateLimiterService.checkRateLimit(company);
  if (!result.allowed) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfter),
    });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded for company: ${company}`,
      retryAfter: result.retryAfter,
      limit: rateLimiterService.getConfig().maxRequests,
      windowMs: rateLimiterService.getConfig().windowMs,
    }, null, 2));
    return true;
  }
  return false;
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
    // Landing page
    if (url === '/' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CEDA - Cognitive Event-Driven Architecture</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; color: #fff; }
    .tagline { color: #888; font-size: 1.2rem; margin-bottom: 2rem; }
    .section { background: #1a1a1a; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
    h2 { color: #4a9eff; margin-bottom: 1rem; font-size: 1.3rem; }
    p { line-height: 1.6; margin-bottom: 1rem; }
    code { background: #2a2a2a; padding: 0.2rem 0.5rem; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9rem; }
    pre { background: #2a2a2a; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1rem 0; }
    pre code { background: none; padding: 0; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; text-align: center; }
    .stat { background: #2a2a2a; padding: 1rem; border-radius: 8px; }
    .stat-value { font-size: 2rem; font-weight: bold; color: #4a9eff; }
    .stat-label { color: #888; font-size: 0.9rem; }
    a { color: #4a9eff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { text-align: center; color: #666; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CEDA</h1>
    <p class="tagline">Cognitive Event-Driven Architecture</p>

    <div class="section">
      <h2>What is CEDA?</h2>
      <p>CEDA learns from how you work. It observes patterns, clusters similar observations, and graduates successful patterns for reuse across projects.</p>
      <p>Think of it as Elisp for business intelligence - use it, and it improves.</p>
    </div>

    <div class="section">
      <h2>Quick Start</h2>
      <p>Connect via Herald MCP in Claude CLI:</p>
      <pre><code>{
  "mcpServers": {
    "herald": {
      "command": "npx",
      "args": ["@spilno/herald-mcp"],
      "env": {
        "CEDA_URL": "https://getceda.com",
        "HERALD_COMPANY": "your-company",
        "HERALD_PROJECT": "your-project"
      }
    }
  }
}</code></pre>
      <p>Save as <code>.mcp.json</code> in your project root, restart Claude CLI.</p>
    </div>

    <div class="section">
      <h2>Current Status</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${patternLibrary.getAllPatterns().length}</div>
          <div class="stat-label">Patterns</div>
        </div>
        <div class="stat">
          <div class="stat-value">${sessionService.getActiveSessionCount()}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat">
          <div class="stat-value">OK</div>
          <div class="stat-label">Status</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Resources</h2>
      <p>
        <a href="https://github.com/Spilno-me/ceda/blob/main/docs/herald-setup-guide.md">Setup Guide</a> ·
        <a href="/health">Health Check</a> ·
        <a href="https://github.com/Spilno-me/ceda">GitHub</a>
      </p>
    </div>

    <p class="footer">Built by Spilno</p>
  </div>
</body>
</html>`);
      return;
    }

    // Health check
    if (url === '/health' && method === 'GET') {
      const health = orchestrator.getHealthStatus();
      sendJson(res, 200, {
        status: 'ok',
        service: 'ceda',
        version: '1.0.0',
        ...health,
      });
      return;
    }

    // API Documentation - dual format (HTML/JSON) via content negotiation
    if ((url === '/docs' || url?.startsWith('/docs?')) && method === 'GET') {
      const urlObj = new URL(url, `http://${req.headers.host || 'localhost'}`);
      const formatParam = urlObj.searchParams.get('format');
      const acceptHeader = req.headers.accept || '';

      // Return JSON if: ?format=json OR Accept: application/json (and not text/html)
      const wantsJson = formatParam === 'json' ||
        (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html'));

      if (wantsJson) {
        sendJson(res, 200, {
          service: 'ceda',
          version: '1.0.0',
          endpoints: API_ENDPOINTS,
          total: API_ENDPOINTS.length,
        });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderDocsHtml());
      }
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

      // CEDA-43: Rate limiting check
      if (await checkRateLimitAndRespond(body.company, res)) {
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
      const effectiveSignal = session.messages.length > 0
        ? sessionService.getCombinedSignal(sessionId) + '. ' + body.input
        : body.input;

      console.log(`\n[CEDA] Processing: "${body.input}" (session: ${sessionId}, turn: ${session.messages.length + 1})`);
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
        session.messages.length === 0 ? 'signal' : 'refinement',
        finalPrediction,
        confidence,
        body.participant,
      );

      console.log(`[CEDA] Complete in ${Date.now() - startTime}ms - Success: ${result.success}`);

      sendJson(res, 200, {
        success: result.success,
        sessionId,
        turn: session.messages.length,
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

    // Feedback endpoint
    if (url === '/api/feedback' && method === 'POST') {
      const body = await parseBody<{
        sessionId: string;
        accepted: boolean;
        comment?: string;
        patternId?: string;
      }>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'Missing required field: sessionId' });
        return;
      }

      console.log(`[CEDA] Feedback for session ${body.sessionId}: ${body.accepted ? 'accepted' : 'rejected'}`);

      // CEDA-51: Boost pattern quality score when prediction is accepted
      let boostedPattern = null;
      if (body.accepted && body.patternId) {
        const pattern = patternLibrary.getPattern(body.patternId);
        if (pattern) {
          boostedPattern = qualityScoreService.boostOnUsage(pattern);
          patternLibrary.registerPattern(boostedPattern);
          console.log(`[CEDA-51] Boosted quality score for pattern ${body.patternId}: ${pattern.qualityScore ?? 'N/A'} -> ${boostedPattern.qualityScore}`);
        }
      }

      sendJson(res, 200, {
        recorded: true,
        sessionId: body.sessionId,
        feedback: body.accepted ? 'positive' : 'negative',
        qualityBoost: boostedPattern ? {
          patternId: body.patternId,
          newScore: boostedPattern.qualityScore,
        } : null,
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

    // Stats endpoint
    if (url === '/api/stats' && method === 'GET') {
      const health = orchestrator.getHealthStatus();
      sendJson(res, 200, {
        service: 'ceda',
        version: '1.0.0',
        patternsLoaded: health.patternsLoaded,
        servicesReady: health.servicesReady,
        activeSessions: sessionService.getActiveSessionCount(),
        observationsEnabled: embeddingService.isAvailable(),
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

      console.log(`\n[CEDA] Refining: "${body.refinement}" (session: ${body.sessionId}, turn: ${session.messages.length + 1})`);
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
        turn: session.messages.length,
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
        turns: session.messages.length,
        participants: session.participants,
        currentPrediction: session.currentPrediction,
        history: session.messages.map((h: import('./interfaces').SessionMessage) => ({
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

    // === CEDA-45: Session Persistence Endpoints ===

    // GET /api/sessions - List sessions with optional filters
    if (url?.startsWith('/api/sessions') && method === 'GET' && !url.includes('/cleanup')) {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company') || undefined;
      const project = urlObj.searchParams.get('project') || undefined;
      const user = urlObj.searchParams.get('user') || undefined;
      const status = urlObj.searchParams.get('status') as 'active' | 'archived' | 'expired' | undefined;
      const limitParam = urlObj.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 100;

      try {
        const sessions = await sessionService.list({
          company,
          project,
          user,
          status,
          limit,
        });

        sendJson(res, 200, {
          sessions: sessions.map(s => ({
            id: s.id,
            company: s.company,
            project: s.project,
            user: s.user,
            status: s.status,
            turns: s.messages.length,
            participants: s.participants,
            hasCurrentPrediction: !!s.currentPrediction,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            expiresAt: s.expiresAt,
          })),
          count: sessions.length,
          filter: { company, project, user, status, limit },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to list sessions:', error);
        sendJson(res, 500, {
          error: 'Failed to list sessions',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // POST /api/sessions/cleanup - Trigger session cleanup/expiration
    if (url === '/api/sessions/cleanup' && method === 'POST') {
      try {
        const result = await sessionService.expireSessions();

        console.log(`[CEDA] Session cleanup: ${result.expiredCount} expired, ${result.archivedCount} archived`);

        sendJson(res, 200, {
          success: true,
          expiredCount: result.expiredCount,
          archivedCount: result.archivedCount,
          expiredIds: result.expiredIds,
          archivedIds: result.archivedIds,
          timestamp: result.timestamp.toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to cleanup sessions:', error);
        sendJson(res, 500, {
          error: 'Failed to cleanup sessions',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // === CEDA-46: Session History and Versioning Endpoints ===

    // GET /api/session/:id/history - Get version history for a session
    if (url?.match(/^\/api\/session\/[^/]+\/history$/) && method === 'GET') {
      const sessionId = url.replace('/api/session/', '').replace('/history', '');
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const limitParam = urlObj.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      try {
        const session = sessionService.get(sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'Session not found', sessionId });
          return;
        }

        const history = await sessionHistoryService.getHistory(sessionId, limit);

        sendJson(res, 200, {
          sessionId: history.sessionId,
          versions: history.versions.map(v => ({
            id: v.id,
            version: v.version,
            changeType: v.changeType,
            changedFields: v.changedFields,
            timestamp: v.timestamp.toISOString(),
          })),
          totalVersions: history.totalVersions,
          currentVersion: history.currentVersion,
          timestamp: history.timestamp.toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to get session history:', error);
        sendJson(res, 500, {
          error: 'Failed to get session history',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/session/:id/history/:version - Get specific version of a session
    if (url?.match(/^\/api\/session\/[^/]+\/history\/\d+$/) && method === 'GET') {
      const parts = url.replace('/api/session/', '').split('/history/');
      const sessionId = parts[0];
      const versionNumber = parseInt(parts[1], 10);

      try {
        const session = sessionService.get(sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'Session not found', sessionId });
          return;
        }

        const version = await sessionHistoryService.getVersion(sessionId, versionNumber);
        if (!version) {
          sendJson(res, 404, { error: 'Version not found', sessionId, version: versionNumber });
          return;
        }

        sendJson(res, 200, {
          id: version.id,
          sessionId: version.sessionId,
          version: version.version,
          changeType: version.changeType,
          changedFields: version.changedFields,
          snapshot: version.snapshot,
          timestamp: version.timestamp.toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to get session version:', error);
        sendJson(res, 500, {
          error: 'Failed to get session version',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // POST /api/session/:id/rollback?version=N - Rollback session to a previous version
    if (url?.match(/^\/api\/session\/[^/]+\/rollback/) && method === 'POST') {
      const sessionId = url.replace('/api/session/', '').replace(/\/rollback.*/, '');
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const versionParam = urlObj.searchParams.get('version');

      if (!versionParam) {
        sendJson(res, 400, { error: 'Missing required query parameter: version' });
        return;
      }

      const targetVersion = parseInt(versionParam, 10);
      if (isNaN(targetVersion) || targetVersion < 1) {
        sendJson(res, 400, { error: 'Invalid version number', version: versionParam });
        return;
      }

      try {
        const session = sessionService.get(sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'Session not found', sessionId });
          return;
        }

        const result = await sessionHistoryService.rollback(
          sessionId,
          targetVersion,
          async (restoredSession) => {
            return sessionService.update(sessionId, {
              currentPrediction: restoredSession.currentPrediction,
              context: restoredSession.context,
              participants: restoredSession.participants,
              status: restoredSession.status,
            });
          },
        );

        if (!result) {
          sendJson(res, 404, { error: 'Version not found or rollback failed', sessionId, version: targetVersion });
          return;
        }

        console.log(`[CEDA] Session ${sessionId} rolled back to version ${targetVersion}`);

        sendJson(res, 200, {
          success: result.success,
          sessionId: result.sessionId,
          rolledBackToVersion: result.rolledBackToVersion,
          newVersion: result.newVersion,
          session: {
            id: result.session.id,
            status: result.session.status,
            currentPrediction: result.session.currentPrediction,
            participants: result.session.participants,
            updatedAt: result.session.updatedAt.toISOString(),
          },
          timestamp: result.timestamp.toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to rollback session:', error);
        sendJson(res, 500, {
          error: 'Failed to rollback session',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/session/:id/diff?v1=N&v2=M - Compare two versions of a session
    if (url?.match(/^\/api\/session\/[^/]+\/diff/) && method === 'GET') {
      const sessionId = url.replace('/api/session/', '').replace(/\/diff.*/, '');
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const v1Param = urlObj.searchParams.get('v1');
      const v2Param = urlObj.searchParams.get('v2');

      if (!v1Param || !v2Param) {
        sendJson(res, 400, { error: 'Missing required query parameters: v1, v2' });
        return;
      }

      const v1 = parseInt(v1Param, 10);
      const v2 = parseInt(v2Param, 10);

      if (isNaN(v1) || isNaN(v2) || v1 < 1 || v2 < 1) {
        sendJson(res, 400, { error: 'Invalid version numbers', v1: v1Param, v2: v2Param });
        return;
      }

      try {
        const session = sessionService.get(sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'Session not found', sessionId });
          return;
        }

        const diff = await sessionHistoryService.diff(sessionId, v1, v2);
        if (!diff) {
          sendJson(res, 404, { error: 'One or both versions not found', sessionId, v1, v2 });
          return;
        }

        sendJson(res, 200, {
          sessionId: diff.sessionId,
          fromVersion: diff.fromVersion,
          toVersion: diff.toVersion,
          changedFields: diff.changedFields,
          changes: diff.changes,
          timestamp: diff.timestamp.toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to diff session versions:', error);
        sendJson(res, 500, {
          error: 'Failed to diff session versions',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
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

    // Reflect on session - extract patterns through analysis
    if (url === '/api/herald/reflect' && method === 'POST') {
      const body = await parseBody<{
        session: string;
        feeling: 'stuck' | 'success';
        insight?: string;  // User-provided insight - what specifically worked/failed
        method?: 'direct' | 'simulation';  // Capture method for meta-learning
        // AI-extracted fields (from simulation)
        signal?: string;
        outcome?: 'pattern' | 'antipattern';
        reinforcement?: string;
        warning?: string;
        // Context
        company?: string;
        project?: string;
        user?: string;
        vault?: string;
      }>(req);

      if (!body.session || !body.feeling) {
        sendJson(res, 400, { error: 'Missing required fields: session, feeling' });
        return;
      }

      const clientIp = getClientIp(req);

      // CEDA-65: Sanitize data before storage
      const { SanitizationService, DataClassification } = await import('./services/sanitization.service');
      const sanitizationService = new SanitizationService();

      // Combine all text fields for sanitization
      const textToSanitize = [
        body.session,
        body.insight,
        body.signal,
        body.reinforcement,
        body.warning,
      ].filter(Boolean).join(' | ');

      const sanitizationResult = sanitizationService.sanitize(textToSanitize);

      // Block storage if RESTRICTED data detected
      if (sanitizationResult.dataClass === DataClassification.RESTRICTED) {
        await auditService.logSanitization(
          body.company || 'default',
          body.user || 'default',
          true,
          sanitizationResult.detectedTypes,
          sanitizationResult.dataClass,
          clientIp,
        );

        sendJson(res, 400, {
          error: 'Content blocked due to restricted data',
          blocked: true,
          detectedTypes: sanitizationResult.detectedTypes,
          dataClass: sanitizationResult.dataClass,
          message: 'Private keys and other restricted data cannot be stored. Please remove sensitive content and try again.',
        });
        return;
      }

      // Log sanitization if any redactions were made
      if (sanitizationResult.detectedTypes.length > 0) {
        await auditService.logSanitization(
          body.company || 'default',
          body.user || 'default',
          false,
          sanitizationResult.detectedTypes,
          sanitizationResult.dataClass,
          clientIp,
        );
      }

      // Use sanitized text for storage
      const sanitizedSession = sanitizationService.sanitize(body.session).sanitizedText;
      const sanitizedInsight = body.insight ? sanitizationService.sanitize(body.insight).sanitizedText : undefined;
      const sanitizedSignal = body.signal ? sanitizationService.sanitize(body.signal).sanitizedText : undefined;
      const sanitizedReinforcement = body.reinforcement ? sanitizationService.sanitize(body.reinforcement).sanitizedText : undefined;
      const sanitizedWarning = body.warning ? sanitizationService.sanitize(body.warning).sanitizedText : undefined;

      const reflectionId = randomUUID();
      const timestamp = new Date().toISOString();
      const captureMethod = body.method || 'direct';

      // Store as insight for pattern learning (legacy format) - using sanitized text
      const patternText = sanitizedInsight
        ? `${sanitizedInsight} | Context: ${sanitizedSession}`
        : sanitizedSession;

      const insights = heraldStorage.loadInsights();
      const reflectionInsight: HeraldInsight = {
        id: reflectionId,
        fromContext: body.vault || body.user || 'herald',
        toContext: 'ceda-reflect',
        topic: body.feeling === 'stuck' ? 'antipattern' : 'pattern',
        insight: `[REFLECT:${body.feeling}] ${patternText}`,
        timestamp,
      };
      insights.push(reflectionInsight);
      heraldStorage.saveInsights(insights);

      // Store reflection with method tracking (meta-learning) - using sanitized values
      const reflections = heraldStorage.loadReflections();
      const reflection: HeraldReflection = {
        id: reflectionId,
        session: sanitizedSession,
        feeling: body.feeling,
        insight: sanitizedInsight || sanitizedSession,
        method: captureMethod,
        // AI-extracted fields - using sanitized values
        signal: sanitizedSignal,
        outcome: body.outcome || (body.feeling === 'stuck' ? 'antipattern' : 'pattern'),
        reinforcement: sanitizedReinforcement,
        warning: sanitizedWarning,
        // Context
        company: body.company || 'default',
        project: body.project || 'default',
        user: body.user || 'default',
        // Tracking
        applications: [],
        timestamp,
      };
      reflections.push(reflection);
      heraldStorage.saveReflections(reflections);

      const response = {
        reflectionId,
        feeling: body.feeling,
        insight: body.insight,
        method: captureMethod,
        recorded: true,
        timestamp,
        message: body.insight
          ? (body.feeling === 'stuck'
              ? `Antipattern captured: "${body.insight}"`
              : `Pattern captured: "${body.insight}"`)
          : (body.feeling === 'stuck'
              ? 'Friction recorded. Signal→antipattern mapping queued for analysis.'
              : 'Success recorded. Signal→pattern mapping queued for reinforcement.'),
        context: {
          company: body.company || 'default',
          project: body.project || 'default',
          user: body.user || 'default',
        },
        // AI-extracted (if simulation)
        extracted: body.signal ? {
          signal: body.signal,
          outcome: body.outcome,
          reinforcement: body.reinforcement,
          warning: body.warning,
        } : undefined,
      };

      console.log(`[Herald] Reflection recorded: ${body.feeling} via ${captureMethod} from ${body.vault || body.user || 'unknown'}`);

      sendJson(res, 200, response);
      return;
    }

    // CEDA-65: Dry-run mode for reflection - preview what would be captured without storing
    if (url === '/api/herald/reflect/dry-run' && method === 'POST') {
      const body = await parseBody<{
        session: string;
        feeling: 'stuck' | 'success';
        insight?: string;
        company?: string;
        project?: string;
        user?: string;
      }>(req);

      if (!body.session || !body.feeling) {
        sendJson(res, 400, { error: 'Missing required fields: session, feeling' });
        return;
      }

      const clientIp = getClientIp(req);

      // Import sanitization service dynamically to avoid circular deps
      const { SanitizationService } = await import('./services/sanitization.service');
      const sanitizationService = new SanitizationService();

      // Analyze what would be sanitized
      const textToAnalyze = body.insight
        ? `${body.insight} | Context: ${body.session}`
        : body.session;

      const sanitizationResult = sanitizationService.dryRun(textToAnalyze);

      // Log dry-run audit event
      await auditService.log(
        'reflection_dry_run',
        `dry-run-${body.company || 'default'}`,
        body.company || 'default',
        body.user || 'default',
        {
          feeling: body.feeling,
          wouldSanitize: sanitizationResult.wouldSanitize,
          wouldBlock: sanitizationResult.wouldBlock,
          detectedTypes: sanitizationResult.detectedTypes,
          classification: sanitizationResult.classification,
        },
        clientIp,
      );

      sendJson(res, 200, {
        dryRun: true,
        feeling: body.feeling,
        insight: body.insight,
        session: body.session,
        sanitization: {
          wouldSanitize: sanitizationResult.wouldSanitize,
          wouldBlock: sanitizationResult.wouldBlock,
          blockReason: sanitizationResult.blockReason,
          detectedTypes: sanitizationResult.detectedTypes,
          classification: sanitizationResult.classification,
          redactionCount: sanitizationResult.redactionCount,
        },
        message: sanitizationResult.wouldBlock
          ? 'Content would be BLOCKED due to restricted data'
          : sanitizationResult.wouldSanitize
            ? `Content would be sanitized (${sanitizationResult.redactionCount} redactions)`
            : 'Content is safe to store',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // CEDA-65: GDPR Article 17 - Right to Erasure (herald_forget)
    if (url === '/api/herald/forget' && method === 'DELETE') {
      const body = await parseBody<{
        patternId?: string;
        sessionId?: string;
        all?: boolean;
        company?: string;
        project?: string;
        user?: string;
      }>(req);

      const company = body.company || 'default';
      const project = body.project || 'default';
      const user = body.user || 'default';
      const clientIp = getClientIp(req);

      if (!body.patternId && !body.sessionId && !body.all) {
        sendJson(res, 400, { error: 'At least one parameter required: patternId, sessionId, or all' });
        return;
      }

      let deletedCount = 0;
      let reflections = heraldStorage.loadReflections();
      const originalCount = reflections.length;

      if (body.patternId) {
        // Delete specific pattern
        reflections = reflections.filter(r => r.id !== body.patternId);
        deletedCount = originalCount - reflections.length;
      } else if (body.sessionId) {
        // Delete all patterns from a session
        reflections = reflections.filter(r => r.session !== body.sessionId);
        deletedCount = originalCount - reflections.length;
      } else if (body.all) {
        // Delete all patterns for this context
        reflections = reflections.filter(r =>
          !(r.company === company && r.project === project && r.user === user)
        );
        deletedCount = originalCount - reflections.length;
      }

      heraldStorage.saveReflections(reflections);

      // Also clean up insights
      let insights = heraldStorage.loadInsights();
      const originalInsightCount = insights.length;

      if (body.patternId) {
        insights = insights.filter(i => i.id !== body.patternId);
      } else if (body.sessionId) {
        const sessionIdToMatch = body.sessionId;
        insights = insights.filter(i => !i.insight.includes(sessionIdToMatch));
      } else if (body.all) {
        insights = insights.filter(i => i.fromContext !== user);
      }

      heraldStorage.saveInsights(insights);
      const deletedInsights = originalInsightCount - insights.length;

      // Log GDPR deletion audit event
      await auditService.logDataDeletion(
        company,
        user,
        body.patternId ? 'pattern' : body.sessionId ? 'session' : 'all',
        body.patternId || body.sessionId,
        deletedCount + deletedInsights,
        clientIp,
      );

      sendJson(res, 200, {
        success: true,
        deleted: {
          reflections: deletedCount,
          insights: deletedInsights,
          total: deletedCount + deletedInsights,
        },
        gdprArticle: 'Article 17 - Right to Erasure',
        context: { company, project, user },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // CEDA-65: GDPR Article 20 - Right to Data Portability (herald_export)
    if (url?.startsWith('/api/herald/export') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company') || 'default';
      const project = urlObj.searchParams.get('project') || 'default';
      const user = urlObj.searchParams.get('user') || 'default';
      const format = urlObj.searchParams.get('format') || 'json';
      const clientIp = getClientIp(req);

      // Get all reflections for this context
      let reflections = heraldStorage.loadReflections();
      reflections = reflections.filter(r =>
        r.company === company && r.project === project && r.user === user
      );

      // Get all insights for this context
      let insights = heraldStorage.loadInsights();
      insights = insights.filter(i => i.fromContext === user);

      const exportData = {
        exportedAt: new Date().toISOString(),
        gdprArticle: 'Article 20 - Right to Data Portability',
        context: { company, project, user },
        data: {
          reflections: reflections.map(r => ({
            id: r.id,
            session: r.session,
            feeling: r.feeling,
            insight: r.insight,
            method: r.method,
            signal: r.signal,
            outcome: r.outcome,
            reinforcement: r.reinforcement,
            warning: r.warning,
            timestamp: r.timestamp,
          })),
          insights: insights.map(i => ({
            id: i.id,
            topic: i.topic,
            insight: i.insight,
            timestamp: i.timestamp,
          })),
        },
        counts: {
          reflections: reflections.length,
          insights: insights.length,
          total: reflections.length + insights.length,
        },
      };

      // Log GDPR export audit event
      await auditService.logDataExport(
        company,
        user,
        format,
        exportData.counts.total,
        clientIp,
      );

      if (format === 'csv') {
        // Convert to CSV format
        const csvLines: string[] = [];
        csvLines.push('type,id,timestamp,content,feeling,method');

        for (const r of reflections) {
          const escapedInsight = `"${(r.insight || '').replace(/"/g, '""')}"`;
          csvLines.push(`reflection,${r.id},${r.timestamp},${escapedInsight},${r.feeling},${r.method}`);
        }

        for (const i of insights) {
          const escapedInsight = `"${(i.insight || '').replace(/"/g, '""')}"`;
          csvLines.push(`insight,${i.id},${i.timestamp},${escapedInsight},,`);
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="ceda-export-${company}-${user}.csv"`,
        });
        res.end(csvLines.join('\n'));
        return;
      }

      // Default: JSON format
      sendJson(res, 200, exportData);
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

    // GET /api/herald/reflections - Query learned patterns/antipatterns for context
    // This is what Claude queries to learn from past sessions
    if (url?.startsWith('/api/herald/reflections') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company');
      const project = urlObj.searchParams.get('project');
      const feeling = urlObj.searchParams.get('feeling'); // 'stuck' or 'success'
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);

      let reflections = heraldStorage.loadReflections();

      // Filter by company
      if (company) {
        reflections = reflections.filter(r => r.company === company);
      }

      // Filter by project
      if (project) {
        reflections = reflections.filter(r => r.project === project);
      }

      // Filter by feeling (pattern vs antipattern)
      if (feeling) {
        reflections = reflections.filter(r => r.feeling === feeling);
      }

      // Sort by timestamp descending, most recent first
      reflections = reflections
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      // Format for Claude consumption
      const patterns = reflections.filter(r => r.feeling === 'success').map(r => ({
        id: r.id,
        insight: r.insight,
        signal: r.signal,
        reinforcement: r.reinforcement,
        method: r.method,
        applications: r.applications.length,
        timestamp: r.timestamp,
      }));

      const antipatterns = reflections.filter(r => r.feeling === 'stuck').map(r => ({
        id: r.id,
        insight: r.insight,
        signal: r.signal,
        warning: r.warning,
        method: r.method,
        applications: r.applications.length,
        timestamp: r.timestamp,
      }));

      sendJson(res, 200, {
        patterns,
        antipatterns,
        total: reflections.length,
        context: { company, project },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/herald/pattern-applied - Track when a pattern was applied and if it helped
    if (url === '/api/herald/pattern-applied' && method === 'POST') {
      const body = await parseBody<{
        reflectionId: string;
        sessionId: string;
        helped: boolean;
      }>(req);

      if (!body.reflectionId || !body.sessionId || body.helped === undefined) {
        sendJson(res, 400, { error: 'Missing required fields: reflectionId, sessionId, helped' });
        return;
      }

      const reflections = heraldStorage.loadReflections();
      const reflection = reflections.find(r => r.id === body.reflectionId);

      if (!reflection) {
        sendJson(res, 404, { error: 'Reflection not found' });
        return;
      }

      // Add application record
      reflection.applications.push({
        sessionId: body.sessionId,
        timestamp: new Date().toISOString(),
        helped: body.helped,
      });

      heraldStorage.saveReflections(reflections);

      console.log(`[Herald] Pattern application recorded: ${body.reflectionId} helped=${body.helped}`);

      sendJson(res, 200, {
        recorded: true,
        reflectionId: body.reflectionId,
        totalApplications: reflection.applications.length,
        helpRate: reflection.applications.filter(a => a.helped).length / reflection.applications.length,
      });
      return;
    }

    // GET /api/herald/meta-patterns - Get learned meta-patterns (which method works better)
    if (url?.startsWith('/api/herald/meta-patterns') && method === 'GET') {
      const metaPatterns = heraldStorage.loadMetaPatterns();

      sendJson(res, 200, {
        metaPatterns,
        count: metaPatterns.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/herald/meta-reflect - Trigger meta-reflection to learn which method works better
    if (url === '/api/herald/meta-reflect' && method === 'POST') {
      const reflections = heraldStorage.loadReflections();

      // Group by method
      const direct = reflections.filter(r => r.method === 'direct');
      const simulation = reflections.filter(r => r.method === 'simulation');

      // Calculate help rates
      const calculateHelpRate = (refs: HeraldReflection[]) => {
        const withApplications = refs.filter(r => r.applications.length > 0);
        if (withApplications.length === 0) return 0;
        const helped = withApplications.filter(r => r.applications.some(a => a.helped));
        return helped.length / withApplications.length;
      };

      const directHelpRate = calculateHelpRate(direct);
      const simHelpRate = calculateHelpRate(simulation);

      // Determine recommended method
      const recommendedMethod = simHelpRate > directHelpRate ? 'simulation' : 'direct';
      const confidence = Math.abs(simHelpRate - directHelpRate);

      // Store meta-pattern if significant difference
      if (confidence > 0.1) {
        const metaPatterns = heraldStorage.loadMetaPatterns();
        const existingIndex = metaPatterns.findIndex(m => m.contextSignal === 'general');

        const metaPattern: MetaPattern = {
          id: existingIndex >= 0 ? metaPatterns[existingIndex].id : randomUUID(),
          contextSignal: 'general',
          recommendedMethod,
          confidence,
          evidenceCount: reflections.length,
          evidenceIds: reflections.map(r => r.id),
          lastUpdated: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          metaPatterns[existingIndex] = metaPattern;
        } else {
          metaPatterns.push(metaPattern);
        }

        heraldStorage.saveMetaPatterns(metaPatterns);
      }

      sendJson(res, 200, {
        analyzed: true,
        stats: {
          direct: { count: direct.length, helpRate: directHelpRate },
          simulation: { count: simulation.length, helpRate: simHelpRate },
        },
        recommendation: {
          method: recommendedMethod,
          confidence,
          reason: `${recommendedMethod} has ${(confidence * 100).toFixed(0)}% better help rate`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-64: Herald Command Extensions ===

    // POST /api/herald/feedback - Provide feedback on whether a pattern helped
    if (url === '/api/herald/feedback' && method === 'POST') {
      const body = await parseBody<{
        patternId?: string;
        patternText?: string;
        outcome: 'helped' | 'didnt_help';
        helped?: boolean;
        company?: string;
        project?: string;
        user?: string;
      }>(req);

      if (!body.patternId && !body.patternText) {
        sendJson(res, 400, { error: 'Missing required field: patternId or patternText' });
        return;
      }

      if (!body.outcome) {
        sendJson(res, 400, { error: 'Missing required field: outcome' });
        return;
      }

      const reflections = heraldStorage.loadReflections();
      let reflection: HeraldReflection | undefined;

      // Find by ID first, then by text match
      if (body.patternId) {
        reflection = reflections.find(r => r.id === body.patternId);
      } else if (body.patternText) {
        reflection = reflections.find(r => 
          r.insight.toLowerCase().includes(body.patternText!.toLowerCase()) ||
          r.signal?.toLowerCase().includes(body.patternText!.toLowerCase())
        );
      }

      if (!reflection) {
        sendJson(res, 404, { 
          error: 'Pattern not found',
          hint: 'Use pattern_id from herald_patterns output or provide matching pattern_text'
        });
        return;
      }

      // Record the feedback as an application
      const helped = body.outcome === 'helped' || body.helped === true;
      reflection.applications.push({
        sessionId: `feedback-${Date.now()}`,
        timestamp: new Date().toISOString(),
        helped,
      });

      heraldStorage.saveReflections(reflections);

      const helpRate = reflection.applications.filter(a => a.helped).length / reflection.applications.length;

      console.log(`[Herald] Pattern feedback recorded: ${reflection.id} outcome=${body.outcome} helped=${helped}`);

      sendJson(res, 200, {
        recorded: true,
        patternId: reflection.id,
        outcome: body.outcome,
        totalApplications: reflection.applications.length,
        helpRate,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/herald/share - Share insight with scoped targeting
    if (url === '/api/herald/share' && method === 'POST') {
      const body = await parseBody<{
        insight: string;
        scope: 'parent' | 'siblings' | 'all';
        topic?: string;
        sourceCompany?: string;
        sourceProject?: string;
        sourceUser?: string;
        sourceVault?: string;
      }>(req);

      if (!body.insight) {
        sendJson(res, 400, { error: 'Missing required field: insight' });
        return;
      }

      if (!body.scope || !['parent', 'siblings', 'all'].includes(body.scope)) {
        sendJson(res, 400, { error: 'Missing or invalid scope. Must be: parent, siblings, or all' });
        return;
      }

      const insights = heraldStorage.loadInsights();
      const sharedInsights: HeraldInsight[] = [];
      const sourceContext = body.sourceVault || body.sourceUser || 'herald';
      const timestamp = new Date().toISOString();

      // Determine target contexts based on scope
      let targetContexts: string[] = [];
      
      switch (body.scope) {
        case 'parent':
          // Share with parent company level
          if (body.sourceProject && body.sourceCompany) {
            targetContexts = [`${body.sourceCompany}:parent`];
          } else if (body.sourceCompany) {
            targetContexts = ['global:parent'];
          }
          break;
        case 'siblings':
          // Share with sibling projects in same company
          if (body.sourceCompany) {
            targetContexts = [`${body.sourceCompany}:siblings`];
          }
          break;
        case 'all':
          // Share globally
          targetContexts = ['all'];
          break;
      }

      // Create insight records for each target
      for (const target of targetContexts) {
        const newInsight: HeraldInsight = {
          id: randomUUID(),
          fromContext: sourceContext,
          toContext: target,
          topic: body.topic,
          insight: body.insight,
          timestamp,
        };
        insights.push(newInsight);
        sharedInsights.push(newInsight);
      }

      heraldStorage.saveInsights(insights);

      console.log(`[Herald] Insight shared with scope=${body.scope} from ${sourceContext} to ${targetContexts.join(', ')}`);

      sendJson(res, 200, {
        shared: true,
        scope: body.scope,
        targetContexts,
        insightIds: sharedInsights.map(i => i.id),
        topic: body.topic || 'general',
        timestamp,
      });
      return;
    }

    // === CEDA-44: Pattern Quality Score Endpoints ===

    // GET /api/patterns/low-quality - Get patterns below quality threshold
    if (url?.startsWith('/api/patterns/low-quality') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const threshold = parseInt(urlObj.searchParams.get('threshold') || '50', 10);
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

      const accessiblePatterns = patternLibrary.getPatternsForUser(query);
      const lowQualityPatterns = qualityScoreService.flagLowQuality(accessiblePatterns, threshold);

      sendJson(res, 200, {
        patterns: lowQualityPatterns.map(p => ({
          ...p,
          qualityScore: p.qualityScore ?? qualityScoreService.calculateScore(p),
          qualityFactors: qualityScoreService.getQualityFactors(p),
        })),
        count: lowQualityPatterns.length,
        threshold,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/patterns/quality-check - Bulk quality check for patterns
    if (url === '/api/patterns/quality-check' && method === 'POST') {
      const body = await parseBody<{
        patternIds?: string[];
        user: string;
        company?: string;
        project?: string;
        threshold?: number;
      }>(req);

      // User is required for pattern access (user-first isolation)
      if (!body.user) {
        sendJson(res, 400, {
          error: 'Missing required field: user',
          message: 'USER is the doorway - all pattern access requires user context',
        });
        return;
      }

      const query: UserPatternQuery = {
        user: body.user,
        company: body.company,
        project: body.project,
      };

      const threshold = body.threshold ?? qualityScoreService.getDefaultThreshold();
      let patternsToCheck: import('./interfaces').Pattern[];

      if (body.patternIds && body.patternIds.length > 0) {
        // Check specific patterns
        patternsToCheck = body.patternIds
          .map(id => patternLibrary.getPatternForUser(id, query))
          .filter((p): p is import('./interfaces').Pattern => p !== undefined);
      } else {
        // Check all accessible patterns
        patternsToCheck = patternLibrary.getPatternsForUser(query);
      }

      const results = patternsToCheck.map(pattern => 
        qualityScoreService.getQualityScoreResult(pattern, threshold)
      );

      const lowQualityCount = results.filter(r => r.isLowQuality).length;

      sendJson(res, 200, {
        results,
        summary: {
          total: results.length,
          lowQuality: lowQualityCount,
          highQuality: results.length - lowQualityCount,
          threshold,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/patterns/:id/quality - Get quality score for a specific pattern
    if (url?.match(/^\/api\/patterns\/[^/]+\/quality/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'patterns' && pathParts[3] === 'quality') {
        const patternId = pathParts[2];
        const user = urlObj.searchParams.get('user');
        const threshold = parseInt(urlObj.searchParams.get('threshold') || '30', 10);

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

        const qualityResult = qualityScoreService.getQualityScoreResult(pattern, threshold);

        sendJson(res, 200, {
          ...qualityResult,
          weights: qualityScoreService.getWeights(),
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // === CEDA-51: Quality Decay Endpoints ===

    // GET /api/patterns/:id/decay-preview - Preview decay for a specific pattern
    if (url?.match(/^\/api\/patterns\/[^/]+\/decay-preview/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'patterns' && pathParts[3] === 'decay-preview') {
        const patternId = pathParts[2];
        const user = urlObj.searchParams.get('user');
        const threshold = parseInt(urlObj.searchParams.get('threshold') || '30', 10);

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

        const decayPreview = qualityScoreService.getDecayPreview(pattern, threshold);

        sendJson(res, 200, {
          ...decayPreview,
          decayConfig: qualityScoreService.getDecayConfig(),
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // POST /api/patterns/decay-job - Admin endpoint to trigger decay job
    if (url === '/api/patterns/decay-job' && method === 'POST') {
      const body = await parseBody<{
        user: string;
        company?: string;
        project?: string;
        threshold?: number;
      }>(req);

      if (!body.user) {
        sendJson(res, 400, {
          error: 'Missing required field: user',
          message: 'USER is the doorway - all pattern access requires user context',
        });
        return;
      }

      const query: UserPatternQuery = {
        user: body.user,
        company: body.company,
        project: body.project,
      };

      const threshold = body.threshold ?? qualityScoreService.getDefaultThreshold();
      const patterns = patternLibrary.getPatternsForUser(query);
      
      const { result, updatedPatterns } = qualityScoreService.runDecayJob(patterns, threshold);

      // Update patterns in the library
      for (const updatedPattern of updatedPatterns) {
        patternLibrary.registerPattern(updatedPattern);
      }

      // CEDA-43: Audit log decay job execution
      await auditService.log(
        'decay_job_executed',
        'system',
        body.company || 'global',
        body.user,
        { 
          processedCount: result.processedCount,
          decayedCount: result.decayedCount,
          droppedBelowThreshold: result.droppedBelowThreshold,
        },
        getClientIp(req),
      );

      sendJson(res, 200, {
        ...result,
        decayConfig: qualityScoreService.getDecayConfig(),
      });
      return;
    }

    // GET /api/patterns/decaying - Get patterns approaching decay threshold
    if (url?.startsWith('/api/patterns/decaying') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const user = urlObj.searchParams.get('user');
      const threshold = parseInt(urlObj.searchParams.get('threshold') || '30', 10);

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
      const decayingPatterns = qualityScoreService.getDecayingPatterns(patterns, threshold);

      sendJson(res, 200, {
        patterns: decayingPatterns.map(({ pattern, preview }) => ({
          id: pattern.id,
          name: pattern.name,
          category: pattern.category,
          ...preview,
        })),
        count: decayingPatterns.length,
        threshold,
        decayConfig: qualityScoreService.getDecayConfig(),
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

      // CEDA-43: Rate limiting check
      if (await checkRateLimitAndRespond(body.company, res)) {
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

      // CEDA-43: Audit log pattern creation
      await auditService.log(
        'pattern_created',
        body.id,
        body.company,
        body.user,
        { name: body.name, category: body.category },
        getClientIp(req),
      );

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

      // CEDA-43: Audit log pattern deletion
      await auditService.log(
        'pattern_deleted',
        patternId,
        company,
        user,
        { name: existingPattern.name, category: existingPattern.category },
        getClientIp(req),
      );

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

    // === CEDA-35: OBSERVATION CAPTURE ENDPOINTS ===

    // POST /api/observe - Capture pattern observation from Herald session
    if (url === '/api/observe' && method === 'POST') {
      const body = await parseBody<{
        sessionId: string;
        company: string;
        project?: string;
        user?: string;
        outcome: string;
        finalStructure?: StructurePrediction;
        feedback?: string;
        patternId?: string;
        patternName?: string;
        processingTime?: number;
      }>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'Missing required field: sessionId' });
        return;
      }

      if (!body.company) {
        sendJson(res, 400, { error: 'Missing required field: company' });
        return;
      }

      if (!body.outcome || !['accepted', 'modified', 'rejected'].includes(body.outcome)) {
        sendJson(res, 400, { 
          error: 'Missing or invalid outcome',
          validOutcomes: ['accepted', 'modified', 'rejected'],
        });
        return;
      }

      const session = sessionService.get(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found', sessionId: body.sessionId });
        return;
      }

      if (!session.currentPrediction) {
        sendJson(res, 400, { error: 'No prediction in session to observe', sessionId: body.sessionId });
        return;
      }

      try {
        const observation = await observationService.capture(
          session,
          body.outcome as ObservationOutcome,
          body.finalStructure,
          body.feedback,
          body.patternId,
          body.patternName,
          body.company,
          body.project,
          body.user,
          body.processingTime,
        );

        console.log(`[CEDA] Observation captured: ${observation.id} (${body.outcome}, ${observation.modifications.length} modifications)`);

        // CEDA-41: Check for clusterable observations and auto-create patterns
        let autoCreatedPatterns: { id: string; name: string }[] = [];
        try {
          const patterns = await observationService.checkAndCreatePatterns(body.company);
          autoCreatedPatterns = patterns.map(p => ({ id: p.id, name: p.name }));
          if (patterns.length > 0) {
            console.log(`[CEDA-41] Auto-created ${patterns.length} pattern(s) from observation clusters`);
          }
        } catch (clusterError) {
          console.warn('[CEDA-41] Clustering check failed (non-fatal):', clusterError instanceof Error ? clusterError.message : clusterError);
        }

        sendJson(res, 200, {
          recorded: true,
          observationId: observation.id,
          sessionId: body.sessionId,
          outcome: observation.outcome,
          modificationsCount: observation.modifications.length,
          timestamp: observation.timestamp,
          // CEDA-41: Include auto-created patterns info
          autoCreatedPatterns: autoCreatedPatterns.length > 0 ? autoCreatedPatterns : undefined,
        });
      } catch (error) {
        console.error('[CEDA] Failed to capture observation:', error);
        sendJson(res, 500, {
          error: 'Failed to capture observation',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // === CEDA-39: DIRECT OBSERVATION CREATION ENDPOINT ===

    // POST /api/observations - Create direct observation without requiring an existing session
    if (url === '/api/observations' && method === 'POST') {
      const body = await parseBody<CreateObservationDto>(req);

      // Validate required fields
      if (!body.input) {
        sendJson(res, 400, { error: 'Missing required field: input' });
        return;
      }

      if (!body.company) {
        sendJson(res, 400, { error: 'Missing required field: company' });
        return;
      }

      // CEDA-43: Rate limiting check
      if (await checkRateLimitAndRespond(body.company, res)) {
        return;
      }

      if (!body.prediction) {
        sendJson(res, 400, { error: 'Missing required field: prediction' });
        return;
      }

      if (!body.outcome || !['accepted', 'modified', 'rejected'].includes(body.outcome)) {
        sendJson(res, 400, { 
          error: 'Missing or invalid outcome',
          validOutcomes: ['accepted', 'modified', 'rejected'],
        });
        return;
      }

      // Validate prediction structure
      if (!body.prediction.moduleType || !body.prediction.sections) {
        sendJson(res, 400, { 
          error: 'Invalid prediction structure',
          message: 'Prediction must include moduleType and sections',
        });
        return;
      }

      try {
        const observation = await observationService.createDirect(body);

        console.log(`[CEDA] Direct observation created: ${observation.id} (${body.outcome}, session: ${observation.sessionId})`);

        // CEDA-43: Audit log observation capture
        await auditService.log(
          'observation_captured',
          observation.id,
          body.company,
          body.user || 'unknown',
          { outcome: body.outcome, patternId: body.patternId, source: 'direct' },
          getClientIp(req),
        );

        // CEDA-41: Check for clusterable observations and auto-create patterns
        let autoCreatedPatterns: { id: string; name: string }[] = [];
        try {
          const patterns = await observationService.checkAndCreatePatterns(body.company);
          autoCreatedPatterns = patterns.map(p => ({ id: p.id, name: p.name }));
          if (patterns.length > 0) {
            console.log(`[CEDA-41] Auto-created ${patterns.length} pattern(s) from observation clusters`);
          }
        } catch (clusterError) {
          console.warn('[CEDA-41] Clustering check failed (non-fatal):', clusterError instanceof Error ? clusterError.message : clusterError);
        }

        sendJson(res, 201, {
          recorded: true,
          observationId: observation.id,
          sessionId: observation.sessionId,
          source: observation.source,
          outcome: observation.outcome,
          modificationsCount: observation.modifications.length,
          timestamp: observation.timestamp,
          // CEDA-41: Include auto-created patterns info
          autoCreatedPatterns: autoCreatedPatterns.length > 0 ? autoCreatedPatterns : undefined,
        });
      } catch (error) {
        console.error('[CEDA] Failed to create direct observation:', error);
        sendJson(res, 500, {
          error: 'Failed to create direct observation',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/observations/similar - Find similar observations using semantic search
    if (url?.startsWith('/api/observations/similar') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const input = urlObj.searchParams.get('input');
      const company = urlObj.searchParams.get('company');
      const limitParam = urlObj.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 10;

      if (!input) {
        sendJson(res, 400, { error: 'Missing required query parameter: input' });
        return;
      }

      if (!company) {
        sendJson(res, 400, { error: 'Missing required query parameter: company' });
        return;
      }

      try {
        const observations = await observationService.findSimilar(input, company, limit);

        sendJson(res, 200, {
          observations: observations.map(obs => ({
            id: obs.id,
            sessionId: obs.sessionId,
            patternId: obs.patternId,
            patternName: obs.patternName,
            outcome: obs.outcome,
            input: obs.input,
            confidence: obs.confidence,
            modificationsCount: obs.modifications.length,
            feedback: obs.feedback,
            timestamp: obs.timestamp,
          })),
          count: observations.length,
          query: { input, company, limit },
        });
      } catch (error) {
        console.error('[CEDA] Failed to find similar observations:', error);
        sendJson(res, 500, {
          error: 'Failed to find similar observations',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/observations/pattern/:id/stats - Get statistics for a pattern's observations
    if (url?.match(/^\/api\/observations\/pattern\/[^/]+\/stats/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[3];
      const company = urlObj.searchParams.get('company');

      if (!patternId) {
        sendJson(res, 400, { error: 'Missing pattern ID in URL' });
        return;
      }

      try {
        const stats = await observationService.getPatternStats(patternId, company || undefined);

        sendJson(res, 200, {
          patternId,
          company: company || 'all',
          stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to get pattern stats:', error);
        sendJson(res, 500, {
          error: 'Failed to get pattern statistics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/observations/:id - Get a specific observation by ID
    if (url?.match(/^\/api\/observations\/[^/]+$/) && !url.includes('/similar') && !url.includes('/pattern') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const observationId = pathParts[2];

      if (!observationId) {
        sendJson(res, 400, { error: 'Missing observation ID in URL' });
        return;
      }

      // CEDA-40: getObservation is now async to support Qdrant fallback retrieval
      const observation = await observationService.getObservation(observationId);
      if (!observation) {
        sendJson(res, 404, { error: 'Observation not found', observationId });
        return;
      }

      sendJson(res, 200, {
        observation,
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

    // === CEDA-36: Pattern Graduation Endpoints ===

    // GET /api/patterns/:id/graduation - Get graduation status for a pattern
    if (url?.match(/^\/api\/patterns\/[^/]+\/graduation$/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];

      const status = await graduationService.getGraduationStatus(patternId);

      if (!status) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId,
        });
        return;
      }

      sendJson(res, 200, {
        ...status,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/patterns/:id/check-graduation - Manually trigger graduation check
    if (url?.match(/^\/api\/patterns\/[^/]+\/check-graduation$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];

      const pattern = patternLibrary.getPattern(patternId);
      if (!pattern) {
        sendJson(res, 404, {
          error: 'Pattern not found',
          patternId,
        });
        return;
      }

      const result = await graduationService.checkGraduation(patternId);

      console.log(`[CEDA] Graduation check for ${patternId}: canGraduate=${result.canGraduate}`);

      sendJson(res, 200, {
        patternId,
        ...result,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/patterns/:id/approve-graduation - Admin approve graduation to shared level
    if (url?.match(/^\/api\/patterns\/[^/]+\/approve-graduation$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];

      const body = await parseBody<{
        adminUserId: string;
        comment?: string;
      }>(req);

      if (!body.adminUserId) {
        sendJson(res, 400, {
          error: 'Missing required field: adminUserId',
        });
        return;
      }

      const result = await graduationService.approveGraduation(
        patternId,
        body.adminUserId,
        body.comment,
      );

      if (!result.success) {
        sendJson(res, 400, {
          error: 'Graduation approval failed',
          patternId,
          reason: 'Pattern does not meet criteria or is not at Company level',
        });
        return;
      }

      console.log(`[CEDA] Graduation approved for ${patternId} by ${body.adminUserId}`);

      sendJson(res, 200, {
        ...result,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/patterns/graduation-candidates - Get patterns eligible for graduation
    if (url?.startsWith('/api/patterns/graduation-candidates') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const levelParam = urlObj.searchParams.get('level');
      const targetLevel = levelParam ? parseInt(levelParam, 10) as PatternLevel : undefined;

      const candidates = await graduationService.getGraduationCandidates(targetLevel);

      sendJson(res, 200, {
        candidates,
        count: candidates.length,
        filter: targetLevel !== undefined ? { targetLevel } : null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/graduation/check-all - Run daily graduation check (admin endpoint)
    if (url === '/api/graduation/check-all' && method === 'POST') {
      const result = await graduationService.checkAllGraduations();

      console.log(`[CEDA] Daily graduation check: ${result.graduated.length} graduated, ${result.pendingApproval.length} pending`);

      sendJson(res, 200, {
        ...result,
        pendingApprovals: graduationService.getPendingApprovals(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/graduation/pending - Get patterns pending admin approval
    if (url === '/api/graduation/pending' && method === 'GET') {
      const pending = graduationService.getPendingApprovals();

      sendJson(res, 200, {
        pending,
        count: pending.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-37: Cross-Domain Learning Endpoints ===

    // GET /api/abstractions/suggest - Find abstractions for a pattern
    if (url?.startsWith('/api/abstractions/suggest') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const patternId = urlObj.searchParams.get('patternId');

      if (!patternId) {
        sendJson(res, 400, { error: 'Missing required query parameter: patternId' });
        return;
      }

      const pattern = patternLibrary.getPattern(patternId);
      if (!pattern) {
        sendJson(res, 404, { error: 'Pattern not found', patternId });
        return;
      }

      try {
        const suggestions = await abstractionService.suggestAbstraction(pattern);

        sendJson(res, 200, {
          patternId,
          suggestions: suggestions.map(s => ({
            abstractionId: s.abstraction.id,
            abstractionName: s.abstraction.name,
            score: s.score,
            matchedStructure: s.matchedStructure,
            suggestedMapping: s.suggestedMapping,
            domains: s.abstraction.domains,
          })),
          count: suggestions.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to suggest abstractions:', error);
        sendJson(res, 500, {
          error: 'Failed to suggest abstractions',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/insights/cross-domain - Get all cross-domain insights
    if (url === '/api/insights/cross-domain' && method === 'GET') {
      const insights = abstractionService.getAllInsights();

      sendJson(res, 200, {
        insights: insights.map(i => ({
          id: i.id,
          abstractionId: i.abstraction.id,
          abstractionName: i.abstraction.name,
          insight: i.insight,
          applicableDomains: i.applicableDomains,
          evidence: i.evidence,
          requiresApproval: i.requiresApproval,
          approved: i.approved,
          approvedBy: i.approvedBy,
          approvedAt: i.approvedAt,
          createdAt: i.createdAt,
        })),
        count: insights.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/abstractions/:id/apply - Apply abstraction to new domain
    if (url?.match(/^\/api\/abstractions\/[^/]+\/apply$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const abstractionId = pathParts[2];

      const body = await parseBody<{
        domain: string;
        mapping: Record<string, string>;
        adminUserId?: string;
      }>(req);

      if (!body.domain) {
        sendJson(res, 400, { error: 'Missing required field: domain' });
        return;
      }

      if (!body.mapping || Object.keys(body.mapping).length === 0) {
        sendJson(res, 400, { error: 'Missing required field: mapping' });
        return;
      }

      try {
        const result = await abstractionService.applyAbstraction({
          abstractionId,
          domain: body.domain,
          mapping: body.mapping,
          adminUserId: body.adminUserId,
        });

        if (!result.success) {
          sendJson(res, 400, {
            error: 'Failed to apply abstraction',
            message: result.message,
            abstractionId,
            domain: body.domain,
          });
          return;
        }

        console.log(`[CEDA] Applied abstraction ${abstractionId} to domain ${body.domain}`);

        sendJson(res, 200, {
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to apply abstraction:', error);
        sendJson(res, 500, {
          error: 'Failed to apply abstraction',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/abstractions/:id/instances - View abstraction instances
    if (url?.match(/^\/api\/abstractions\/[^/]+\/instances$/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const abstractionId = pathParts[2];

      const abstraction = abstractionService.getAbstraction(abstractionId);
      if (!abstraction) {
        sendJson(res, 404, { error: 'Abstraction not found', abstractionId });
        return;
      }

      sendJson(res, 200, {
        abstractionId,
        abstractionName: abstraction.name,
        instances: abstraction.instances,
        count: abstraction.instances.length,
        domains: abstraction.domains,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/abstractions/:id - Get abstraction by ID
    if (url?.match(/^\/api\/abstractions\/[^/]+$/) && !url.includes('/suggest') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const abstractionId = pathParts[2];

      const abstraction = abstractionService.getAbstraction(abstractionId);
      if (!abstraction) {
        sendJson(res, 404, { error: 'Abstraction not found', abstractionId });
        return;
      }

      sendJson(res, 200, {
        abstraction,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/abstractions - Get all abstractions
    if (url === '/api/abstractions' && method === 'GET') {
      const abstractions = abstractionService.getAllAbstractions();

      sendJson(res, 200, {
        abstractions: abstractions.map(a => ({
          id: a.id,
          name: a.name,
          domains: a.domains,
          instanceCount: a.instances.length,
          observationCount: a.observationCount,
          confidence: a.confidence,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
        count: abstractions.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/abstractions/extract - Extract abstraction from patterns
    if (url === '/api/abstractions/extract' && method === 'POST') {
      const body = await parseBody<{
        patternIds: string[];
      }>(req);

      if (!body.patternIds || body.patternIds.length < 2) {
        sendJson(res, 400, { 
          error: 'Missing or insufficient patternIds',
          message: 'At least 2 pattern IDs are required to extract an abstraction',
        });
        return;
      }

      const patterns = body.patternIds
        .map(id => patternLibrary.getPattern(id))
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (patterns.length < 2) {
        sendJson(res, 400, {
          error: 'Insufficient valid patterns',
          message: 'At least 2 valid patterns are required',
          foundPatterns: patterns.length,
          requestedPatterns: body.patternIds.length,
        });
        return;
      }

      try {
        const abstraction = await abstractionService.extractAbstraction(patterns);

        console.log(`[CEDA] Extracted abstraction ${abstraction.id}: "${abstraction.name}" from ${patterns.length} patterns`);

        sendJson(res, 200, {
          abstraction,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to extract abstraction:', error);
        sendJson(res, 500, {
          error: 'Failed to extract abstraction',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // POST /api/insights/generate - Generate cross-domain insights
    if (url === '/api/insights/generate' && method === 'POST') {
      try {
        const insights = await abstractionService.generateInsights();

        console.log(`[CEDA] Generated ${insights.length} cross-domain insights`);

        sendJson(res, 200, {
          insights: insights.map(i => ({
            id: i.id,
            abstractionId: i.abstraction.id,
            insight: i.insight,
            applicableDomains: i.applicableDomains,
            evidence: i.evidence,
            requiresApproval: i.requiresApproval,
          })),
          count: insights.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA] Failed to generate insights:', error);
        sendJson(res, 500, {
          error: 'Failed to generate insights',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // POST /api/insights/:id/approve - Approve a cross-domain insight (admin action)
    if (url?.match(/^\/api\/insights\/[^/]+\/approve$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const insightId = pathParts[2];

      const body = await parseBody<{
        adminUserId: string;
      }>(req);

      if (!body.adminUserId) {
        sendJson(res, 400, { error: 'Missing required field: adminUserId' });
        return;
      }

      const approved = abstractionService.approveInsight(insightId, body.adminUserId);

      if (!approved) {
        sendJson(res, 404, { error: 'Insight not found', insightId });
        return;
      }

      console.log(`[CEDA] Insight ${insightId} approved by ${body.adminUserId}`);

      sendJson(res, 200, {
        approved: true,
        insightId,
        approvedBy: body.adminUserId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/abstractions/audit - Get audit log for cross-domain learning
    if (url?.startsWith('/api/abstractions/audit') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const limitParam = urlObj.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      const auditLog = abstractionService.getAuditLog(limit);

      sendJson(res, 200, {
        auditLog,
        count: auditLog.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-41: Observation Clustering Endpoints ===

    // POST /api/clustering/check - Manually trigger clustering for a company
    if (url === '/api/clustering/check' && method === 'POST') {
      const body = await parseBody<{
        company: string;
      }>(req);

      if (!body.company) {
        sendJson(res, 400, { error: 'Missing required field: company' });
        return;
      }

      try {
        const orphans = await observationService.getOrphanObservations(body.company);
        const orphanCount = orphans.length;
        const patterns = await observationService.checkAndCreatePatterns(body.company);

        console.log(`[CEDA-41] Manual clustering check for ${body.company}: ${orphanCount} orphans, ${patterns.length} patterns created`);

        sendJson(res, 200, {
          company: body.company,
          orphanObservations: orphanCount,
          patternsCreated: patterns.map(p => ({
            id: p.id,
            name: p.name,
            level: p.level,
            description: p.description,
          })),
          count: patterns.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CEDA-41] Clustering check failed:', error);
        sendJson(res, 500, {
          error: 'Clustering check failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/clustering/orphans - Get orphan observations (those without real patterns)
    if (url?.startsWith('/api/clustering/orphans') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company');

      const orphans = await observationService.getOrphanObservations(company || undefined);

      sendJson(res, 200, {
        orphans: orphans.map((o: { id: string; input: string; patternId: string; outcome?: string; feedback?: string; company: string; timestamp: Date }) => ({
          id: o.id,
          input: o.input,
          patternId: o.patternId,
          outcome: o.outcome,
          feedback: o.feedback,
          company: o.company,
          timestamp: o.timestamp,
        })),
        count: orphans.length,
        company: company || 'all',
        config: observationService.getClusteringConfig(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

        // GET /api/clustering/config - Get clustering configuration
        if (url === '/api/clustering/config' && method === 'GET') {
          sendJson(res, 200, {
            config: observationService.getClusteringConfig(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // === CEDA-52: ANOMALY DETECTION ENDPOINTS ===

        // GET /api/anomalies - List anomalies with optional filtering
        if (url?.startsWith('/api/anomalies') && method === 'GET' && !url.includes('/api/anomalies/')) {
          const urlObj = new URL(url, `http://localhost:${PORT}`);
          const company = urlObj.searchParams.get('company') || undefined;
          const type = urlObj.searchParams.get('type') || undefined;
          const status = urlObj.searchParams.get('status') || undefined;
          const severity = urlObj.searchParams.get('severity') || undefined;

          try {
            const anomalies = await anomalyDetectionService.getAnomalies({
              company,
              type: type as import('./interfaces').AnomalyType | undefined,
              status: status as import('./interfaces').AnomalyStatus | undefined,
              severity: severity as import('./interfaces').AnomalySeverity | undefined,
            });

            sendJson(res, 200, {
              anomalies,
              count: anomalies.length,
              filter: { company, type, status, severity },
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error('[CEDA] Failed to get anomalies:', error);
            sendJson(res, 500, {
              error: 'Failed to get anomalies',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          return;
        }

        // POST /api/anomalies/sweep - Trigger detection sweep
        if (url === '/api/anomalies/sweep' && method === 'POST') {
          const body = await parseBody<{
            company?: string;
          }>(req);

          try {
            const results = await anomalyDetectionService.runDetectionSweep(body.company);

            const totalAnomalies = results.reduce((sum, r) => sum + r.anomaliesDetected.length, 0);
            console.log(`[CEDA-52] Detection sweep complete: ${totalAnomalies} anomalies detected across ${results.length} companies`);

            sendJson(res, 200, {
              results,
              totalAnomalies,
              companiesScanned: results.length,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error('[CEDA] Detection sweep failed:', error);
            sendJson(res, 500, {
              error: 'Detection sweep failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          return;
        }

        // POST /api/anomalies/:id/acknowledge - Acknowledge an anomaly
        if (url?.match(/^\/api\/anomalies\/[^/]+\/acknowledge$/) && method === 'POST') {
          const urlObj = new URL(url, `http://localhost:${PORT}`);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          const anomalyId = pathParts[2];

          const body = await parseBody<{
            acknowledgedBy?: string;
          }>(req);

          const anomaly = await anomalyDetectionService.acknowledge(anomalyId, body.acknowledgedBy);

          if (!anomaly) {
            sendJson(res, 404, {
              error: 'Anomaly not found',
              anomalyId,
            });
            return;
          }

          sendJson(res, 200, {
            acknowledged: true,
            anomaly,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // POST /api/anomalies/:id/resolve - Resolve an anomaly
        if (url?.match(/^\/api\/anomalies\/[^/]+\/resolve$/) && method === 'POST') {
          const urlObj = new URL(url, `http://localhost:${PORT}`);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          const anomalyId = pathParts[2];

          const body = await parseBody<{
            resolvedBy?: string;
          }>(req);

          const anomaly = await anomalyDetectionService.resolve(anomalyId, body.resolvedBy);

          if (!anomaly) {
            sendJson(res, 404, {
              error: 'Anomaly not found',
              anomalyId,
            });
            return;
          }

          sendJson(res, 200, {
            resolved: true,
            anomaly,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // === CEDA-50: Analytics Dashboard Endpoints ===

        // GET /api/analytics - Full company analytics dashboard
        if (url?.startsWith('/api/analytics') && method === 'GET') {
          const urlObj = new URL(url, `http://localhost:${PORT}`);
          const pathParts = url.split('?')[0].split('/').filter(Boolean);

          // GET /api/analytics/system - System-wide analytics (admin only)
          if (pathParts[2] === 'system') {
            try {
              const systemAnalytics = await analyticsService.getSystemAnalytics();
              sendJson(res, 200, {
                ...systemAnalytics,
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              console.error('[CEDA-50] System analytics failed:', error);
              sendJson(res, 500, {
                error: 'Failed to get system analytics',
                message: error instanceof Error ? error.message : 'Unknown error',
              });
            }
            return;
          }

          // All other analytics endpoints require company
          const company = urlObj.searchParams.get('company');
          if (!company) {
            sendJson(res, 400, {
              error: 'Missing required parameter: company',
              message: 'Analytics endpoints require company context',
            });
            return;
          }

          const period = (urlObj.searchParams.get('period') || 'week') as 'day' | 'week' | 'month';
          if (!['day', 'week', 'month'].includes(period)) {
            sendJson(res, 400, {
              error: 'Invalid period parameter',
              message: 'Period must be one of: day, week, month',
            });
            return;
          }

          const query = { company, period };

          try {
            // GET /api/analytics/metrics - Core metrics only
            if (pathParts[2] === 'metrics') {
              const metrics = await analyticsService.getMetrics(query);
              sendJson(res, 200, {
                company,
                period,
                metrics,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            // GET /api/analytics/trends - Trend data over time
            if (pathParts[2] === 'trends') {
              const trends = await analyticsService.getTrends(query);
              sendJson(res, 200, {
                company,
                period,
                trends,
                count: trends.length,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            // GET /api/analytics/patterns - Top patterns usage
            if (pathParts[2] === 'patterns') {
              const limit = parseInt(urlObj.searchParams.get('limit') || '10', 10);
              const topPatterns = await analyticsService.getTopPatterns(query, limit);
              sendJson(res, 200, {
                company,
                period,
                topPatterns,
                count: topPatterns.length,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            // GET /api/analytics/users - Active users data
            if (pathParts[2] === 'users') {
              const limit = parseInt(urlObj.searchParams.get('limit') || '10', 10);
              const activeUsers = await analyticsService.getActiveUsers(query, limit);
              sendJson(res, 200, {
                company,
                period,
                activeUsers,
                count: activeUsers.length,
                timestamp: new Date().toISOString(),
              });
              return;
            }

            // GET /api/analytics - Full dashboard data
            const analytics = await analyticsService.getCompanyAnalytics(query);
            sendJson(res, 200, {
              ...analytics,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error('[CEDA-50] Analytics failed:', error);
            sendJson(res, 500, {
              error: 'Failed to get analytics',
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          return;
        }

        // GET /api/abstractions/safety - Get safety settings
        if (url === '/api/abstractions/safety' && method === 'GET') {
      const settings = abstractionService.getSafetySettings();

      sendJson(res, 200, {
        settings,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // PUT /api/abstractions/safety - Update safety settings (admin action)
    if (url === '/api/abstractions/safety' && method === 'PUT') {
      const body = await parseBody<{
        requireAdminApproval?: boolean;
        allowedDomains?: string[];
        disabledDomains?: string[];
        auditEnabled?: boolean;
      }>(req);

      abstractionService.updateSafetySettings(body);

      console.log('[CEDA] Cross-domain learning safety settings updated');

      sendJson(res, 200, {
        updated: true,
        settings: abstractionService.getSafetySettings(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-47: Document Management Endpoints ===

    // POST /api/documents - Create a new document
    if (url === '/api/documents' && method === 'POST') {
      const body = await parseBody<CreateDocumentDto>(req);

      if (!body.type || !body.title || !body.content || !body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['type', 'title', 'content', 'company', 'user'],
        });
        return;
      }

      const validTypes: DocumentType[] = ['pattern', 'observation', 'session', 'insight', 'note'];
      if (!validTypes.includes(body.type)) {
        sendJson(res, 400, {
          error: 'Invalid document type',
          validTypes,
        });
        return;
      }

      if (await checkRateLimitAndRespond(body.company, res)) {
        return;
      }

      const document = await documentService.create(body);

      await auditService.log(
        'document_created',
        document.id,
        body.company,
        body.user,
        { title: body.title, type: body.type },
        getClientIp(req),
      );

      sendJson(res, 201, {
        created: true,
        document,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/documents/search - Search documents
    if (url?.startsWith('/api/documents/search') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const query = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');
      const type = urlObj.searchParams.get('type') as DocumentType | null;
      const tagsParam = urlObj.searchParams.get('tags');
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);

      if (!query || !company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['q', 'company', 'user'],
        });
        return;
      }

      const searchParams: DocumentSearchParams = {
        query,
        company,
        user,
        type: type || undefined,
        tags: tagsParam ? tagsParam.split(',') : undefined,
        limit,
      };

      const results = await documentService.search(searchParams);

      sendJson(res, 200, {
        results,
        count: results.length,
        query: searchParams,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/documents/tags - Get documents by tags
    if (url?.startsWith('/api/documents/tags') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');
      const tagsParam = urlObj.searchParams.get('tags');

      if (!company || !user || !tagsParam) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user', 'tags'],
        });
        return;
      }

      const tags = tagsParam.split(',');
      const documents = documentService.getByTags(company, user, tags);

      sendJson(res, 200, {
        documents,
        count: documents.length,
        tags,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/documents/graph - Get document graph
    if (url?.startsWith('/api/documents/graph') && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');
      const depth = parseInt(urlObj.searchParams.get('depth') || '2', 10);
      const startId = urlObj.searchParams.get('startId') || undefined;

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const params: GraphQueryParams = {
        company,
        user,
        depth,
        startId,
      };

      const graph = documentService.getGraph(params);

      sendJson(res, 200, {
        graph,
        params,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/documents/:id/backlinks - Get backlinks for a document
    if (url?.match(/^\/api\/documents\/[^/]+\/backlinks/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const documentId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const backlinks = documentService.getBacklinks(documentId, company, user);

      sendJson(res, 200, {
        documentId,
        backlinks,
        count: backlinks.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/documents/:id/link - Link to another document
    if (url?.match(/^\/api\/documents\/[^/]+\/link$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const sourceId = pathParts[2];

      const body = await parseBody<LinkDocumentDto>(req);

      if (!body.targetId || !body.linkType || !body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['targetId', 'linkType', 'company', 'user'],
        });
        return;
      }

      const validLinkTypes: DocumentLinkType[] = ['references', 'related', 'parent', 'derived_from'];
      if (!validLinkTypes.includes(body.linkType)) {
        sendJson(res, 400, {
          error: 'Invalid link type',
          validLinkTypes,
        });
        return;
      }

      const link = documentService.link(sourceId, body);

      if (!link) {
        sendJson(res, 404, {
          error: 'Failed to create link',
          message: 'Source or target document not found, or access denied',
        });
        return;
      }

      sendJson(res, 201, {
        linked: true,
        link,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // DELETE /api/documents/:id/link/:targetId - Unlink from a document
    if (url?.match(/^\/api\/documents\/[^/]+\/link\/[^/]+$/) && method === 'DELETE') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const sourceId = pathParts[2];
      const targetId = pathParts[4];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const unlinked = documentService.unlink(sourceId, targetId, company, user);

      if (!unlinked) {
        sendJson(res, 404, {
          error: 'Failed to unlink',
          message: 'Link not found or access denied',
        });
        return;
      }

      sendJson(res, 200, {
        unlinked: true,
        sourceId,
        targetId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/documents/:id - Get a document by ID
    if (url?.match(/^\/api\/documents\/[^/]+$/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const documentId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const document = documentService.getById(documentId, company, user);

      if (!document) {
        sendJson(res, 404, {
          error: 'Document not found or access denied',
          documentId,
        });
        return;
      }

      sendJson(res, 200, {
        document,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // PUT /api/documents/:id - Update a document
    if (url?.match(/^\/api\/documents\/[^/]+$/) && method === 'PUT') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const documentId = pathParts[2];

      const body = await parseBody<UpdateDocumentDto>(req);

      if (!body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['company', 'user'],
        });
        return;
      }

      const document = await documentService.update(documentId, body);

      if (!document) {
        sendJson(res, 404, {
          error: 'Document not found or access denied',
          documentId,
        });
        return;
      }

      sendJson(res, 200, {
        updated: true,
        document,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // DELETE /api/documents/:id - Delete a document
    if (url?.match(/^\/api\/documents\/[^/]+$/) && method === 'DELETE') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const documentId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const deleted = documentService.delete(documentId, company, user);

      if (!deleted) {
        sendJson(res, 404, {
          error: 'Document not found or access denied',
          documentId,
        });
        return;
      }

      await auditService.log(
        'document_deleted',
        documentId,
        company,
        user,
        {},
        getClientIp(req),
      );

      sendJson(res, 200, {
        deleted: true,
        documentId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // === CEDA-48: Bidirectional Linking Endpoints ===

    // POST /api/linking/wrap/:type/:id - Wrap a pattern or observation as a linkable node
    if (url?.match(/^\/api\/linking\/wrap\/(pattern|observation)\/[^/]+$/) && method === 'POST') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const entityType = pathParts[2] as LinkableType;
      const entityId = pathParts[3];

      const body = await parseBody<WrapEntityDto>(req);

      if (!body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['company', 'user'],
        });
        return;
      }

      if (await checkRateLimitAndRespond(body.company, res)) {
        return;
      }

      try {
        let result;
        if (entityType === 'pattern') {
          result = linkingService.wrapPattern(entityId, body.company, body.user, body);
        } else {
          result = await linkingService.wrapObservation(entityId, body.company, body.user, body);
        }

        sendJson(res, result.isNew ? 201 : 200, {
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        sendJson(res, 404, {
          error: 'Entity not found or access denied',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // POST /api/linking/link - Create a link between entities
    if (url === '/api/linking/link' && method === 'POST') {
      const body = await parseBody<CreateLinkDto>(req);

      if (!body.sourceId || !body.sourceType || !body.targetId || !body.targetType || !body.linkType || !body.company || !body.user) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          required: ['sourceId', 'sourceType', 'targetId', 'targetType', 'linkType', 'company', 'user'],
        });
        return;
      }

      const validLinkTypes: LinkType[] = ['derived_from', 'supports', 'contradicts', 'related', 'refines'];
      if (!validLinkTypes.includes(body.linkType)) {
        sendJson(res, 400, {
          error: 'Invalid link type',
          validLinkTypes,
        });
        return;
      }

      if (await checkRateLimitAndRespond(body.company, res)) {
        return;
      }

      try {
        const result = await linkingService.createLink(body);

        sendJson(res, result.isNew ? 201 : 200, {
          ...result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        sendJson(res, 400, {
          error: 'Failed to create link',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    // GET /api/patterns/:id/network - Get pattern network graph
    if (url?.match(/^\/api\/patterns\/[^/]+\/network/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');
      const depth = parseInt(urlObj.searchParams.get('depth') || '2', 10);
      const linkTypesParam = urlObj.searchParams.get('linkTypes');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const linkTypes = linkTypesParam ? linkTypesParam.split(',') as LinkType[] : undefined;
      const network = linkingService.getPatternNetwork(patternId, depth, company, user, linkTypes);

      sendJson(res, 200, {
        network,
        patternId,
        depth,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/patterns/:id/related - Get related patterns
    if (url?.match(/^\/api\/patterns\/[^/]+\/related/) && method === 'GET') {
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const patternId = pathParts[2];
      const company = urlObj.searchParams.get('company');
      const user = urlObj.searchParams.get('user');

      if (!company || !user) {
        sendJson(res, 400, {
          error: 'Missing required query parameters',
          required: ['company', 'user'],
        });
        return;
      }

      const relatedPatterns = linkingService.getRelatedPatterns(patternId, company, user);

      sendJson(res, 200, {
        patternId,
        relatedPatterns,
        count: relatedPatterns.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/linking/stats - Get linking service statistics
    if (url === '/api/linking/stats' && method === 'GET') {
      sendJson(res, 200, {
        nodeCount: linkingService.getNodeCount(),
        linkCount: linkingService.getLinkCount(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 404 - reference API_ENDPOINTS constant
    sendJson(res, 404, {
      error: 'Not found',
      message: 'See /docs for available endpoints',
      docsUrl: '/docs',
      availableEndpoints: API_ENDPOINTS.map(ep => `${ep.method.padEnd(6)} ${ep.path}`),
    });
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
║   v1.0.0                                                  ║
║                                                           ║
║   Port: ${PORT}                                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Initialize vector store in background (non-blocking)
  initializeVectorStore().catch(err => {
    console.error('[CEDA] Vector store initialization error:', err);
  });

  // CEDA-51: Schedule daily decay job at 3 AM UTC
  scheduleDecayJob();
});

// CEDA-51: Decay job scheduler
let decayJobTimer: NodeJS.Timeout | null = null;

function scheduleDecayJob(): void {
  const now = new Date();
  const targetHour = 3; // 3 AM UTC
  
  // Calculate next 3 AM UTC
  const next3AM = new Date(now);
  next3AM.setUTCHours(targetHour, 0, 0, 0);
  
  // If we've already passed 3 AM today, schedule for tomorrow
  if (now >= next3AM) {
    next3AM.setUTCDate(next3AM.getUTCDate() + 1);
  }
  
  const msUntilNext3AM = next3AM.getTime() - now.getTime();
  
  console.log(`[CEDA-51] Decay job scheduled for ${next3AM.toISOString()} (in ${Math.round(msUntilNext3AM / 1000 / 60)} minutes)`);
  
  decayJobTimer = setTimeout(() => {
    runScheduledDecayJob();
    // Schedule the next run (24 hours from now)
    scheduleDecayJob();
  }, msUntilNext3AM);
}

async function runScheduledDecayJob(): Promise<void> {
  console.log('[CEDA-51] Running scheduled decay job at 3 AM UTC...');
  
  try {
    const allPatterns = patternLibrary.getAllPatterns();
    const threshold = qualityScoreService.getDefaultThreshold();
    
    const { result, updatedPatterns } = qualityScoreService.runDecayJob(allPatterns, threshold);
    
    // Update patterns in the library
    for (const updatedPattern of updatedPatterns) {
      patternLibrary.registerPattern(updatedPattern);
    }
    
    // Log to audit service
    await auditService.log(
      'scheduled_decay_job',
      'system',
      'global',
      'system',
      {
        processedCount: result.processedCount,
        decayedCount: result.decayedCount,
        droppedBelowThreshold: result.droppedBelowThreshold,
        scheduledTime: new Date().toISOString(),
      },
      'localhost',
    );
    
    console.log(`[CEDA-51] Scheduled decay job completed: ${result.decayedCount}/${result.processedCount} patterns decayed`);
  } catch (error) {
    console.error('[CEDA-51] Scheduled decay job failed:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[CEDA] Shutting down...');
  if (decayJobTimer) {
    clearTimeout(decayJobTimer);
  }
  server.close(() => process.exit(0));
});
