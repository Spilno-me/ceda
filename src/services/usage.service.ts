/**
 * CEDA-90: Usage Tracking Service
 *
 * Tracks patterns, queries, and projects per user.
 * Enforces tier limits (Free, Pro, Team).
 *
 * Storage: Upstash Redis
 * - usage:${userId}:patterns - total patterns created
 * - usage:${userId}:queries:${month} - queries this month
 * - usage:${userId}:projects - set of project names
 * - usage:${userId}:plan - current plan
 */

import upstashRedis from './upstash-redis.service.js';

export type Plan = 'free' | 'pro' | 'team';

export interface PlanLimits {
  patterns: number;   // -1 = unlimited
  queries: number;    // per month, -1 = unlimited
  projects: number;   // -1 = unlimited
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    patterns: 100,
    queries: 1000,
    projects: 1,
  },
  pro: {
    patterns: 10000,
    queries: -1,  // unlimited
    projects: -1, // unlimited
  },
  team: {
    patterns: -1, // unlimited
    queries: -1,  // unlimited
    projects: -1, // unlimited
  },
};

export interface UsageStats {
  userId: string;
  plan: Plan;
  patterns: { used: number; limit: number };
  queries: { used: number; limit: number };
  projects: { used: number; limit: number };
  periodStart: string;  // First day of current month
}

export interface LimitCheckResult {
  allowed: boolean;
  resource: 'patterns' | 'queries' | 'projects';
  used: number;
  limit: number;
  upgradeUrl?: string;
}

// In-memory fallback when Redis unavailable
const memoryUsage = new Map<string, {
  patterns: number;
  queries: Map<string, number>;  // month -> count
  projects: Set<string>;
  plan: Plan;
}>();

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

class UsageService {
  /**
   * Get usage stats for a user
   */
  async getUsage(userId: string): Promise<UsageStats> {
    const month = getCurrentMonth();

    if (upstashRedis.isEnabled()) {
      // Fetch from Redis
      const [patterns, queries, projects, plan] = await Promise.all([
        this.getPatternCount(userId),
        this.getQueryCount(userId, month),
        this.getProjectCount(userId),
        this.getPlan(userId),
      ]);

      const limits = PLAN_LIMITS[plan];

      return {
        userId,
        plan,
        patterns: { used: patterns, limit: limits.patterns },
        queries: { used: queries, limit: limits.queries },
        projects: { used: projects, limit: limits.projects },
        periodStart: getPeriodStart(),
      };
    }

    // Fallback to memory
    const mem = memoryUsage.get(userId) || {
      patterns: 0,
      queries: new Map(),
      projects: new Set(),
      plan: 'free' as Plan,
    };

    const limits = PLAN_LIMITS[mem.plan];

    return {
      userId,
      plan: mem.plan,
      patterns: { used: mem.patterns, limit: limits.patterns },
      queries: { used: mem.queries.get(month) || 0, limit: limits.queries },
      projects: { used: mem.projects.size, limit: limits.projects },
      periodStart: getPeriodStart(),
    };
  }

  /**
   * Check if user can create a pattern
   */
  async checkPatternLimit(userId: string): Promise<LimitCheckResult> {
    const plan = await this.getPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const used = await this.getPatternCount(userId);

    if (limits.patterns !== -1 && used >= limits.patterns) {
      return {
        allowed: false,
        resource: 'patterns',
        used,
        limit: limits.patterns,
        upgradeUrl: 'https://app.getceda.com/billing',
      };
    }

    return { allowed: true, resource: 'patterns', used, limit: limits.patterns };
  }

  /**
   * Check if user can make a query
   */
  async checkQueryLimit(userId: string): Promise<LimitCheckResult> {
    const plan = await this.getPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const month = getCurrentMonth();
    const used = await this.getQueryCount(userId, month);

    if (limits.queries !== -1 && used >= limits.queries) {
      return {
        allowed: false,
        resource: 'queries',
        used,
        limit: limits.queries,
        upgradeUrl: 'https://app.getceda.com/billing',
      };
    }

    return { allowed: true, resource: 'queries', used, limit: limits.queries };
  }

  /**
   * Check if user can add a project
   */
  async checkProjectLimit(userId: string, projectName: string): Promise<LimitCheckResult> {
    const plan = await this.getPlan(userId);
    const limits = PLAN_LIMITS[plan];
    const projects = await this.getProjects(userId);
    const used = projects.length;

    // If project already exists, allow it
    if (projects.includes(projectName)) {
      return { allowed: true, resource: 'projects', used, limit: limits.projects };
    }

    if (limits.projects !== -1 && used >= limits.projects) {
      return {
        allowed: false,
        resource: 'projects',
        used,
        limit: limits.projects,
        upgradeUrl: 'https://app.getceda.com/billing',
      };
    }

    return { allowed: true, resource: 'projects', used, limit: limits.projects };
  }

  /**
   * Increment pattern count
   */
  async incrementPatterns(userId: string, delta: number = 1): Promise<number> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:patterns`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['INCRBY', key, delta.toString()]),
      });
      const data = await result.json();
      return data.result || 0;
    }

    // Fallback
    const mem = memoryUsage.get(userId) || {
      patterns: 0,
      queries: new Map(),
      projects: new Set(),
      plan: 'free' as Plan,
    };
    mem.patterns += delta;
    memoryUsage.set(userId, mem);
    return mem.patterns;
  }

  /**
   * Increment query count for current month
   */
  async incrementQueries(userId: string, delta: number = 1): Promise<number> {
    const month = getCurrentMonth();

    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:queries:${month}`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['INCRBY', key, delta.toString()]),
      });
      const data = await result.json();

      // Set expiry for end of next month (cleanup old data)
      await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['EXPIRE', key, String(60 * 24 * 60 * 60)]), // 60 days
      });

      return data.result || 0;
    }

    // Fallback
    const mem = memoryUsage.get(userId) || {
      patterns: 0,
      queries: new Map(),
      projects: new Set(),
      plan: 'free' as Plan,
    };
    const current = mem.queries.get(month) || 0;
    mem.queries.set(month, current + delta);
    memoryUsage.set(userId, mem);
    return current + delta;
  }

  /**
   * Add project to user's list
   */
  async addProject(userId: string, projectName: string): Promise<number> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:projects`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SADD', key, projectName]),
      });
      await result.json();

      // Return count
      const countResult = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SCARD', key]),
      });
      const countData = await countResult.json();
      return countData.result || 0;
    }

    // Fallback
    const mem = memoryUsage.get(userId) || {
      patterns: 0,
      queries: new Map(),
      projects: new Set(),
      plan: 'free' as Plan,
    };
    mem.projects.add(projectName);
    memoryUsage.set(userId, mem);
    return mem.projects.size;
  }

  /**
   * Set user's plan
   */
  async setPlan(userId: string, plan: Plan): Promise<void> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:plan`;
      await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', key, plan]),
      });
      return;
    }

    // Fallback
    const mem = memoryUsage.get(userId) || {
      patterns: 0,
      queries: new Map(),
      projects: new Set(),
      plan: 'free' as Plan,
    };
    mem.plan = plan;
    memoryUsage.set(userId, mem);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async getPatternCount(userId: string): Promise<number> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:patterns`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
      });
      const data = await result.json();
      return parseInt(data.result) || 0;
    }

    const mem = memoryUsage.get(userId);
    return mem?.patterns || 0;
  }

  private async getQueryCount(userId: string, month: string): Promise<number> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:queries:${month}`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
      });
      const data = await result.json();
      return parseInt(data.result) || 0;
    }

    const mem = memoryUsage.get(userId);
    return mem?.queries.get(month) || 0;
  }

  private async getProjectCount(userId: string): Promise<number> {
    const projects = await this.getProjects(userId);
    return projects.length;
  }

  private async getProjects(userId: string): Promise<string[]> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:projects`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SMEMBERS', key]),
      });
      const data = await result.json();
      return data.result || [];
    }

    const mem = memoryUsage.get(userId);
    return mem ? Array.from(mem.projects) : [];
  }

  private async getPlan(userId: string): Promise<Plan> {
    if (upstashRedis.isEnabled()) {
      const key = `usage:${userId}:plan`;
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
      });
      const data = await result.json();
      return (data.result as Plan) || 'free';
    }

    const mem = memoryUsage.get(userId);
    return mem?.plan || 'free';
  }
}

// Singleton export
export const usageService = new UsageService();
export default usageService;
