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
  level: 'user' | 'project' | 'org' | 'global';
  graduationStatus: 'active' | 'candidate' | 'graduated' | 'demoted';
  org: string;
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
      org: result.org || result.company || 'unknown',
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
      'org', state.org,
      'project', state.project,
      'user', state.user,
      'createdAt', state.createdAt || now,
      'updatedAt', now,
    ]);

    // Add to org index for queries
    await this.execute(['SADD', `org:${state.org}:patterns`, state.patternId]);
    await this.execute(['SADD', `project:${state.org}:${state.project}:patterns`, state.patternId]);

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
   * Get all patterns for an org
   */
  async getOrgPatterns(org: string): Promise<string[]> {
    // Try new key first, fall back to old key for backwards compatibility
    let result = await this.execute<string[]>(['SMEMBERS', `org:${org}:patterns`]);
    if (!result || result.length === 0) {
      result = await this.execute<string[]>(['SMEMBERS', `company:${org}:patterns`]);
    }
    return result || [];
  }

  /**
   * Get all patterns for a project
   * Note: The key format project:${org}:${project}:patterns is unchanged,
   * only the parameter name changed from company to org
   */
  async getProjectPatterns(org: string, project: string): Promise<string[]> {
    const result = await this.execute<string[]>(['SMEMBERS', `project:${org}:${project}:patterns`]);
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
          org: result.org || result.company || 'unknown',
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
  // HERALD REFLECTIONS STORAGE (CEDA-42)
  // ============================================

  /**
   * Store a reflection persistently
   */
  async storeReflection(reflection: {
    id: string;
    session: string;
    feeling: 'stuck' | 'success';
    insight: string;
    method?: string;
    signal?: string;
    outcome?: string;
    reinforcement?: string;
    warning?: string;
    org: string;
    project: string;
    user: string;
    vault?: string;
    timestamp: string;
  }): Promise<boolean> {
    const key = `reflection:${reflection.id}`;
    const result = await this.execute(['SET', key, JSON.stringify(reflection)]);

    // Add to org index
    if (result !== null) {
      await this.execute(['SADD', `org:${reflection.org}:reflections`, reflection.id]);
      await this.execute(['SADD', `project:${reflection.org}:${reflection.project}:reflections`, reflection.id]);

      // Add to type index (pattern vs antipattern)
      const type = reflection.feeling === 'stuck' ? 'antipattern' : 'pattern';
      await this.execute(['SADD', `org:${reflection.org}:${type}s`, reflection.id]);
    }

    return result !== null;
  }

  /**
   * Get all reflections for an org
   */
  async getReflections(org: string, options?: {
    project?: string;
    feeling?: 'stuck' | 'success';
    limit?: number;
  }): Promise<unknown[]> {
    // Get reflection IDs from index - try new keys first, fall back to old keys
    let setKey = `org:${org}:reflections`;
    let fallbackKey = `company:${org}:reflections`;

    if (options?.project) {
      setKey = `project:${org}:${options.project}:reflections`;
      fallbackKey = `project:${org}:${options.project}:reflections`;
    }

    if (options?.feeling) {
      const type = options.feeling === 'stuck' ? 'antipattern' : 'pattern';
      setKey = `org:${org}:${type}s`;
      fallbackKey = `company:${org}:${type}s`;
    }

    let ids = await this.execute<string[]>(['SMEMBERS', setKey]);
    // Fall back to old key format for backwards compatibility
    if (!ids || ids.length === 0) {
      ids = await this.execute<string[]>(['SMEMBERS', fallbackKey]);
    }
    if (!ids || ids.length === 0) return [];

    // Fetch all reflections
    const commands = ids.map(id => ['GET', `reflection:${id}`]);
    const results = await this.pipeline<string>(commands);

    if (!results) return [];

    const reflections = results
      .filter(r => r !== null)
      .map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(r => r !== null);

    // Sort by timestamp descending
    reflections.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return options?.limit ? reflections.slice(0, options.limit) : reflections;
  }

  /**
   * Delete a reflection (GDPR Art 17)
   */
  async deleteReflection(id: string, org: string, project: string): Promise<boolean> {
    // Get the reflection first to know its type
    const data = await this.execute<string>(['GET', `reflection:${id}`]);
    if (!data) return false;

    try {
      const reflection = JSON.parse(data);
      const type = reflection.feeling === 'stuck' ? 'antipattern' : 'pattern';

      // Remove from all indexes (both new and old key formats for backwards compatibility)
      await this.execute(['SREM', `org:${org}:reflections`, id]);
      await this.execute(['SREM', `company:${org}:reflections`, id]);
      await this.execute(['SREM', `project:${org}:${project}:reflections`, id]);
      await this.execute(['SREM', `org:${org}:${type}s`, id]);
      await this.execute(['SREM', `company:${org}:${type}s`, id]);

      // Delete the reflection itself
      const result = await this.execute(['DEL', `reflection:${id}`]);
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Store an insight
   */
  async storeInsight(insight: {
    id: string;
    fromContext: string;
    toContext: string;
    topic: string;
    insight: string;
    timestamp: string;
  }): Promise<boolean> {
    const key = `insight:${insight.id}`;
    const result = await this.execute(['SET', key, JSON.stringify(insight)]);

    if (result !== null) {
      // Index by topic
      await this.execute(['SADD', `insights:topic:${insight.topic}`, insight.id]);
      // Index by context
      await this.execute(['SADD', `insights:context:${insight.toContext}`, insight.id]);
    }

    return result !== null;
  }

  /**
   * Get insights by topic or context
   */
  async getInsights(options?: { topic?: string; context?: string }): Promise<unknown[]> {
    let setKey = 'insights:all';

    if (options?.topic) {
      setKey = `insights:topic:${options.topic}`;
    } else if (options?.context) {
      setKey = `insights:context:${options.context}`;
    }

    const ids = await this.execute<string[]>(['SMEMBERS', setKey]);
    if (!ids || ids.length === 0) return [];

    const commands = ids.map(id => ['GET', `insight:${id}`]);
    const results = await this.pipeline<string>(commands);

    if (!results) return [];

    return results
      .filter(r => r !== null)
      .map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(r => r !== null);
  }

  /**
   * Count reflections for an org
   */
  async countReflections(org: string): Promise<{ patterns: number; antipatterns: number }> {
    // Try new keys first, fall back to old keys for backwards compatibility
    let patterns = await this.execute<number>(['SCARD', `org:${org}:patterns`]) || 0;
    if (patterns === 0) {
      patterns = await this.execute<number>(['SCARD', `company:${org}:patterns`]) || 0;
    }
    let antipatterns = await this.execute<number>(['SCARD', `org:${org}:antipatterns`]) || 0;
    if (antipatterns === 0) {
      antipatterns = await this.execute<number>(['SCARD', `company:${org}:antipatterns`]) || 0;
    }
    return { patterns, antipatterns };
  }

  // ============================================
  // USER PREFERENCES (CEDA-42)
  // ============================================

  /**
   * Store user preferences persistently
   */
  async setUserPreferences(userId: string, preferences: {
    defaultOrg?: string;
    defaultProject?: string;
    selectedRepos?: string[];
    customTags?: string[];
  }): Promise<boolean> {
    const key = `user:${userId}:preferences`;
    const result = await this.execute(['SET', key, JSON.stringify(preferences)]);
    return result !== null;
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<{
    defaultOrg?: string;
    defaultProject?: string;
    selectedRepos?: string[];
    customTags?: string[];
  } | null> {
    const key = `user:${userId}:preferences`;
    const result = await this.execute<string>(['GET', key]);
    if (!result) return null;

    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  /**
   * Delete user preferences (GDPR Art 17)
   */
  async deleteUserPreferences(userId: string): Promise<boolean> {
    const key = `user:${userId}:preferences`;
    const result = await this.execute(['DEL', key]);
    return result !== null;
  }

  // ============================================
  // MIGRATION HELPERS (CEDA-97)
  // ============================================

  /**
   * Migrate keys from company to org naming convention
   * This helper migrates data from old company:* keys to new org:* keys
   */
  async migrateCompanyToOrg(orgId: string): Promise<{
    migratedPatterns: number;
    migratedReflections: number;
    migratedAntipatterns: number;
  }> {
    let migratedPatterns = 0;
    let migratedReflections = 0;
    let migratedAntipatterns = 0;

    // Migrate patterns set
    const oldPatternIds = await this.execute<string[]>(['SMEMBERS', `company:${orgId}:patterns`]);
    if (oldPatternIds && oldPatternIds.length > 0) {
      for (const patternId of oldPatternIds) {
        await this.execute(['SADD', `org:${orgId}:patterns`, patternId]);
        migratedPatterns++;
      }
      // Optionally delete old key after migration
      // await this.execute(['DEL', `company:${orgId}:patterns`]);
    }

    // Migrate reflections set
    const oldReflectionIds = await this.execute<string[]>(['SMEMBERS', `company:${orgId}:reflections`]);
    if (oldReflectionIds && oldReflectionIds.length > 0) {
      for (const reflectionId of oldReflectionIds) {
        await this.execute(['SADD', `org:${orgId}:reflections`, reflectionId]);
        migratedReflections++;
      }
      // Optionally delete old key after migration
      // await this.execute(['DEL', `company:${orgId}:reflections`]);
    }

    // Migrate antipatterns set
    const oldAntipatternIds = await this.execute<string[]>(['SMEMBERS', `company:${orgId}:antipatterns`]);
    if (oldAntipatternIds && oldAntipatternIds.length > 0) {
      for (const antipatternId of oldAntipatternIds) {
        await this.execute(['SADD', `org:${orgId}:antipatterns`, antipatternId]);
        migratedAntipatterns++;
      }
      // Optionally delete old key after migration
      // await this.execute(['DEL', `company:${orgId}:antipatterns`]);
    }

    // Migrate pattern state records (update company field to org)
    const allPatternIds = [...new Set([...(oldPatternIds || []), ...(await this.execute<string[]>(['SMEMBERS', `org:${orgId}:patterns`]) || [])])];
    for (const patternId of allPatternIds) {
      const state = await this.execute<Record<string, string>>(['HGETALL', `pattern:${patternId}:state`]);
      if (state && state.company && !state.org) {
        await this.execute(['HSET', `pattern:${patternId}:state`, 'org', state.company]);
      }
    }

    return { migratedPatterns, migratedReflections, migratedAntipatterns };
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
