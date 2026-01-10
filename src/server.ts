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
import { PatternLibraryService } from './services/pattern-library.service';
import { PredictionEngineService } from './services/prediction-engine.service';
import { CognitiveValidationService } from './services/validation.service';
import { CognitiveOrchestratorService } from './services/orchestrator.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorStoreService } from './services/vector-store.service';
import { HSE_PATTERNS } from './seed';

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
const orchestrator = new CognitiveOrchestratorService(
  signalProcessor,
  patternLibrary,
  predictionEngine,
  validationService,
);

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

      const context = (body.context || []).map((c) => ({
        ...c,
        timestamp: new Date(),
      }));

      console.log(`\n[CEDA] Processing: "${body.input}"`);
      const startTime = Date.now();

      const result = await orchestrator.execute(body.input, context, body.config);

      console.log(`[CEDA] Complete in ${Date.now() - startTime}ms - Success: ${result.success}`);

      sendJson(res, 200, {
        success: result.success,
        prediction: result.prediction,
        validation: result.validation,
        autoFixed: result.autoFixed,
        appliedFixes: result.appliedFixes,
        processingTime: result.processingTime,
        stages: result.stages,
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
        note: 'Demo mode - feedback stats not persisted',
      });
      return;
    }

    // 404
    sendJson(res, 404, { error: 'Not found', availableEndpoints: [
      'GET  /health',
      'POST /api/predict',
      'POST /api/feedback',
      'GET  /api/stats',
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
console.log('[CEDA] QDRANT_API_KEY:', process.env.QDRANT_API_KEY ? `${process.env.QDRANT_API_KEY.slice(0, 10)}...` : 'NOT SET');
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
║   - GET  /api/stats     Get feedback statistics           ║
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
