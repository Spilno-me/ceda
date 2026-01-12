/**
 * CEDA Client for Herald
 * 
 * CEDA-34: Stateless Herald - All session state lives in CEDA
 * This client handles communication with CEDA server including:
 * - Session management (get, update, delete)
 * - Prediction requests
 * - Health checks
 * - Connection retry logic with exponential backoff
 */

import { StructurePrediction, ContextSignal, ValidationResult } from '../interfaces';

export interface CedaSession {
  sessionId: string;
  originalSignal: string;
  turns: number;
  participants: string[];
  currentPrediction: StructurePrediction | null;
  history: Array<{
    turn: number;
    input: string;
    inputType: 'signal' | 'refinement' | 'context';
    participant?: string;
    confidence: number;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CedaHealthResponse {
  status: string;
  service: string;
  patternsLoaded: number;
  servicesReady: boolean;
}

export interface CedaPredictRequest {
  input: string;
  sessionId?: string;
  company: string;
  user?: string;
  project?: string;
  context?: Array<{ type: string; value: unknown; source: string }>;
  config?: {
    enableAutoFix?: boolean;
    maxAutoFixAttempts?: number;
  };
}

export interface CedaPredictResponse {
  success: boolean;
  sessionId: string;
  turn: number;
  prediction: StructurePrediction | null;
  validation: ValidationResult | null;
  autoFixed: boolean;
  appliedFixes: string[];
  processingTime: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * CEDA Client for stateless Herald
 * Handles all communication with CEDA server
 */
export class CedaClient {
  private baseUrl: string;
  private retryConfig: RetryConfig;

  constructor(baseUrl?: string, retryConfig?: Partial<RetryConfig>) {
    this.baseUrl = baseUrl || process.env.CEDA_URL || 'http://localhost:3030';
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute request with exponential backoff retry
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retryConfig.maxRetries) {
          console.error(`[CedaClient] ${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`);
          await this.sleep(delay);
          delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
        }
      }
    }

    throw new Error(`[CedaClient] ${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Make HTTP request to CEDA
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Check CEDA health
   */
  async health(): Promise<CedaHealthResponse> {
    return this.withRetry(
      () => this.request<CedaHealthResponse>('GET', '/health'),
      'health check',
    );
  }

  /**
   * Check if CEDA is reachable (non-throwing)
   */
  async isHealthy(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const health = await this.health();
      return { healthy: health.status === 'ok' };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get session from CEDA
   */
  async getSession(sessionId: string): Promise<CedaSession | null> {
    try {
      return await this.withRetry(
        () => this.request<CedaSession>('GET', `/api/session/${sessionId}`),
        `get session ${sessionId}`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update session in CEDA
   */
  async updateSession(
    sessionId: string,
    updates: {
      currentPrediction?: StructurePrediction | null;
      context?: ContextSignal[];
      participants?: string[];
    },
  ): Promise<CedaSession> {
    return this.withRetry(
      () => this.request<CedaSession>('PUT', `/api/session/${sessionId}`, updates),
      `update session ${sessionId}`,
    );
  }

  /**
   * Delete session from CEDA
   */
  async deleteSession(sessionId: string): Promise<{ deleted: boolean; sessionId: string }> {
    return this.withRetry(
      () => this.request<{ deleted: boolean; sessionId: string }>('DELETE', `/api/session/${sessionId}`),
      `delete session ${sessionId}`,
    );
  }

  /**
   * Run prediction through CEDA pipeline
   */
  async predict(request: CedaPredictRequest): Promise<CedaPredictResponse> {
    return this.withRetry(
      () => this.request<CedaPredictResponse>('POST', '/api/predict', request),
      'predict',
    );
  }

  /**
   * Refine existing prediction
   */
  async refine(sessionId: string, refinement: string, company: string): Promise<CedaPredictResponse> {
    return this.withRetry(
      () => this.request<CedaPredictResponse>('POST', '/api/refine', {
        sessionId,
        refinement,
        company,
      }),
      `refine session ${sessionId}`,
    );
  }

  /**
   * Record observation in CEDA
   */
  async observe(sessionId: string, behavior: string, context?: string): Promise<{ recorded: boolean; observationId: string }> {
    return this.withRetry(
      () => this.request<{ recorded: boolean; observationId: string }>('POST', '/observe', {
        sessionId,
        behavior,
        context,
      }),
      'observe',
    );
  }

  /**
   * Get CEDA URL for diagnostics
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Singleton instance for Herald
 */
let cedaClientInstance: CedaClient | null = null;

export function getCedaClient(): CedaClient {
  if (!cedaClientInstance) {
    cedaClientInstance = new CedaClient();
  }
  return cedaClientInstance;
}

export function resetCedaClient(): void {
  cedaClientInstance = null;
}
