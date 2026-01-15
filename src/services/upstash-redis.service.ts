/**
 * CEDA-67: Upstash Redis Service
 *
 * Serverless Redis for adaptive state persistence.
 * Handles: feedback weights, decay state, graduation status, context hierarchy.
 *
 * Why Upstash:
 * - Serverless (pay per command)
 * - HTTP-based (works from Railway, Edge, anywhere)
 * - Atomic operations (INCR, HSET)
 * - TTL support (session expiration)
 * - Horizontal scaling ready (shared state across instances)
 */

// Upstash REST API - no TCP connection needed
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

interface RedisResponse<T = unknown> {
  result: T;
  error?: string;
}

/**
 * Adaptive state for a pattern
 */
export interface PatternAdaptiveState {
  patternId: string;
  weight: number;           // Effectiveness score (0-1)
  feedbackCount: number;    // Times reinforced
  lastUsed: string;         // ISO timestamp
  decayFactor: number;      // Current decay multiplier
  level: 'user' | 'project' | 'company' | 'global';
  graduationStatus: 'active' | 'candidate' | 'graduated' | 'demoted';
  company: string;
  project: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rate limit window
 */
export interface RateLimitState {
  count: number;
  windowStart: number;
}

class UpstashRedisService {
  private enabled: boolean;

  constructor() {
    this.enabled = !!(UPSTASH_URL && UPSTASH_TOKEN);
    if (this.enabled) {
      console.log('[UpstashRedis] Initialized with Upstash REST API');
    } else {
      console.log('[UpstashRedis] Not configured - falling back to in-memory');
    }
  }

  /**
   * Check if Redis is available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Execute Redis command via REST API
   */
  private async execute<T = unknown>(command: string[]): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const response = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      });

      const data: RedisResponse<T> = await response.json();

      if (data.error) {
        console.error('[UpstashRedis] Error:', data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error('[UpstashRedis] Request failed:', error);
      return null;
    }
  }

  /**
   * Pipeline multiple commands
   */
  private async pipeline<T = unknown>(commands: string[][]): Promise<T[] | null> {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
      });

      const data: RedisResponse<T>[] = await response.json();
      return data.map(d => d.result);
    } catch (error) {
      console.error('[UpstashRedis] Pipeline failed:', error);
      return null;
    }
  }

  // ============================================
  // ADAPTIVE STATE OPERATIONS
  // ============================================

  /**
   * Get pattern adaptive state
   */
  async getPatternState(patternId: string): Promise<PatternAdaptiveState | null> {
    const key = `pattern:${patternId}:state`;
    const result = await this.execute<Record<string, string>>(['HGETALL', key]);

    if (!result || Object.keys(result).length === 0) return null;

    return {
      patternId,
      weight: parseFloat(result.weight) || 0.5,
      feedbackCount: parseInt(result.feedbackCount) || 0,
      lastUsed: result.lastUsed || new Date().toISOString(),
      decayFactor: parseFloat(result.decayFactor) || 1.0,
      level: (result.level as PatternAdaptiveState['level']) || 'user',
      graduationStatus: (result.graduationStatus as PatternAdaptiveState['graduationStatus']) || 'active',
      company: result.company || 'unknown',
      project: result.project || 'default',
      user: result.user || 'default',
      createdAt: result.createdAt || new Date().toISOString(),
      updatedAt: result.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Set pattern adaptive state
   */
  async setPatternState(state: PatternAdaptiveState): Promise<boolean> {
    const key = `pattern:${state.patternId}:state`;
    const now = new Date().toISOString();

    const result = await this.execute(['HSET', key,
      'weight', state.weight.toString(),
      'feedbackCount', state.feedbackCount.toString(),
      'lastUsed', state.lastUsed,
      'decayFactor', state.decayFactor.toString(),
      'level', state.level,
      'graduationStatus', state.graduationStatus,
      'company', state.company,
      'project', state.project,
      'user', state.user,
      'createdAt', state.createdAt || now,
      'updatedAt', now,
    ]);

    // Add to company index for queries
    await this.execute(['SADD', `company:${state.company}:patterns`, state.patternId]);
    await this.execute(['SADD', `project:${state.company}:${state.project}:patterns`, state.patternId]);

    return result !== null;
  }

  /**
   * Increment feedback count atomically
   */
  async incrementFeedback(patternId: string, delta: number = 1): Promise<number> {
    const key = `pattern:${patternId}:state`;
    const result = await this.execute<number>(['HINCRBY', key, 'feedbackCount', delta.toString()]);

    // Update lastUsed
    await this.execute(['HSET', key, 'lastUsed', new Date().toISOString()]);

    return result || 0;
  }

  /**
   * Update pattern weight
   */
  async updateWeight(patternId: string, weight: number): Promise<boolean> {
    const key = `pattern:${patternId}:state`;
    const result = await this.execute(['HSET', key,
      'weight', Math.max(0, Math.min(1, weight)).toString(),
      'updatedAt', new Date().toISOString(),
    ]);
    return result !== null;
  }

  /**
   * Update decay factor
   */
  async updateDecay(patternId: string, decayFactor: number): Promise<boolean> {
    const key = `pattern:${patternId}:state`;
    const result = await this.execute(['HSET', key,
      'decayFactor', decayFactor.toString(),
      'updatedAt', new Date().toISOString(),
    ]);
    return result !== null;
  }

  /**
   * Update graduation status
   */
  async updateGraduation(patternId: string, status: PatternAdaptiveState['graduationStatus'], level?: PatternAdaptiveState['level']): Promise<boolean> {
    const key = `pattern:${patternId}:state`;
    const updates = ['graduationStatus', status, 'updatedAt', new Date().toISOString()];

    if (level) {
      updates.push('level', level);
    }

    const result = await this.execute(['HSET', key, ...updates]);
    return result !== null;
  }

  /**
   * Get all patterns for a company
   */
  async getCompanyPatterns(company: string): Promise<string[]> {
    const result = await this.execute<string[]>(['SMEMBERS', `company:${company}:patterns`]);
    return result || [];
  }

  /**
   * Get all patterns for a project
   */
  async getProjectPatterns(company: string, project: string): Promise<string[]> {
    const result = await this.execute<string[]>(['SMEMBERS', `project:${company}:${project}:patterns`]);
    return result || [];
  }

  /**
   * Batch get multiple pattern states
   */
  async getPatternStates(patternIds: string[]): Promise<Map<string, PatternAdaptiveState>> {
    const states = new Map<string, PatternAdaptiveState>();

    // Use pipeline for efficiency
    const commands = patternIds.map(id => ['HGETALL', `pattern:${id}:state`]);
    const results = await this.pipeline<Record<string, string>>(commands);

    if (!results) return states;

    for (let i = 0; i < patternIds.length; i++) {
      const result = results[i];
      if (result && Object.keys(result).length > 0) {
        states.set(patternIds[i], {
          patternId: patternIds[i],
          weight: parseFloat(result.weight) || 0.5,
          feedbackCount: parseInt(result.feedbackCount) || 0,
          lastUsed: result.lastUsed || new Date().toISOString(),
          decayFactor: parseFloat(result.decayFactor) || 1.0,
          level: (result.level as PatternAdaptiveState['level']) || 'user',
          graduationStatus: (result.graduationStatus as PatternAdaptiveState['graduationStatus']) || 'active',
          company: result.company || 'unknown',
          project: result.project || 'default',
          user: result.user || 'default',
          createdAt: result.createdAt || new Date().toISOString(),
          updatedAt: result.updatedAt || new Date().toISOString(),
        });
      }
    }

    return states;
  }

  // ============================================
  // RATE LIMITING OPERATIONS
  // ============================================

  /**
   * Check and increment rate limit (sliding window)
   */
  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    const now = Date.now();
    const redisKey = `ratelimit:${key}`;

    // Use sorted set for sliding window
    // Remove old entries, count current, add new
    const commands = [
      ['ZREMRANGEBYSCORE', redisKey, '0', (now - windowMs).toString()],
      ['ZCARD', redisKey],
      ['ZADD', redisKey, now.toString(), `${now}-${Math.random()}`],
      ['EXPIRE', redisKey, Math.ceil(windowMs / 1000).toString()],
    ];

    const results = await this.pipeline<number>(commands);

    if (!results) {
      // Fallback: allow if Redis is down
      return { allowed: true, remaining: maxRequests };
    }

    const count = results[1] || 0;

    if (count >= maxRequests) {
      // Get oldest entry to calculate retry time
      const oldest = await this.execute<[string, string][]>(['ZRANGE', redisKey, '0', '0', 'WITHSCORES']);
      const oldestTime = oldest?.[0]?.[1] ? parseInt(oldest[0][1]) : now;
      const retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
    };
  }

  // ============================================
  // CACHE OPERATIONS
  // ============================================

  /**
   * Get cached value
   */
  async cacheGet<T>(key: string): Promise<T | null> {
    const result = await this.execute<string>(['GET', `cache:${key}`]);
    if (!result) return null;

    try {
      return JSON.parse(result) as T;
    } catch {
      return result as unknown as T;
    }
  }

  /**
   * Set cached value with TTL
   */
  async cacheSet<T>(key: string, value: T, ttlSeconds: number = 300): Promise<boolean> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const result = await this.execute(['SET', `cache:${key}`, serialized, 'EX', ttlSeconds.toString()]);
    return result !== null;
  }

  /**
   * Delete cached value
   */
  async cacheDelete(key: string): Promise<boolean> {
    const result = await this.execute(['DEL', `cache:${key}`]);
    return result !== null;
  }

  /**
   * Cache hot patterns (frequently accessed)
   */
  async cacheHotPattern(patternId: string, pattern: unknown, ttlSeconds: number = 600): Promise<boolean> {
    return this.cacheSet(`hot:pattern:${patternId}`, pattern, ttlSeconds);
  }

  /**
   * Get hot pattern from cache
   */
  async getHotPattern<T>(patternId: string): Promise<T | null> {
    return this.cacheGet<T>(`hot:pattern:${patternId}`);
  }

  // ============================================
  // SESSION STATE OPERATIONS
  // ============================================

  /**
   * Store session state with TTL
   */
  async setSessionState(sessionId: string, state: unknown, ttlSeconds: number = 86400): Promise<boolean> {
    return this.cacheSet(`session:${sessionId}`, state, ttlSeconds);
  }

  /**
   * Get session state
   */
  async getSessionState<T>(sessionId: string): Promise<T | null> {
    return this.cacheGet<T>(`session:${sessionId}`);
  }

  /**
   * Extend session TTL
   */
  async extendSession(sessionId: string, ttlSeconds: number = 86400): Promise<boolean> {
    const result = await this.execute(['EXPIRE', `cache:session:${sessionId}`, ttlSeconds.toString()]);
    return result !== null;
  }

  // ============================================
  // HEALTH & DIAGNOSTICS
  // ============================================

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    const result = await this.execute<string>(['PING']);
    return result === 'PONG';
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<{ enabled: boolean; connected: boolean; url: string }> {
    const connected = await this.ping();
    return {
      enabled: this.enabled,
      connected,
      url: UPSTASH_URL ? new URL(UPSTASH_URL).host : 'not configured',
    };
  }
}

// Singleton export
export const upstashRedis = new UpstashRedisService();
export default upstashRedis;
