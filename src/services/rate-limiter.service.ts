/**
 * CEDA-43: Rate Limiter Service
 * CEDA-67: Redis-backed for horizontal scaling
 *
 * Implements sliding window rate limiting for adversarial hardening.
 * Limits requests per company to prevent abuse.
 *
 * Uses Upstash Redis when available for shared state across instances.
 * Falls back to in-memory for development/standalone mode.
 */

import { Injectable } from '@nestjs/common';
import { upstashRedis } from './upstash-redis.service';

interface RateLimitWindow {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  // In-memory fallback when Redis is not available
  private readonly windows: Map<string, RateLimitWindow> = new Map();

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    if (upstashRedis.isEnabled()) {
      console.log('[RateLimiter] Using Upstash Redis for distributed rate limiting');
    } else {
      console.log('[RateLimiter] Using in-memory rate limiting (single instance)');
    }
  }

  /**
   * Check if a request is allowed under the rate limit
   * Uses sliding window algorithm to track requests per company
   * @param company - Company identifier for rate limiting
   * @returns RateLimitResult with allowed status and retry info
   */
  async checkRateLimit(company: string): Promise<RateLimitResult> {
    // Try Redis first for distributed rate limiting
    if (upstashRedis.isEnabled()) {
      return upstashRedis.checkRateLimit(company, this.maxRequests, this.windowMs);
    }

    // Fallback to in-memory for standalone mode
    return this.checkRateLimitInMemory(company);
  }

  /**
   * In-memory rate limiting (fallback when Redis unavailable)
   */
  private checkRateLimitInMemory(company: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let window = this.windows.get(company);
    if (!window) {
      window = { timestamps: [] };
      this.windows.set(company, window);
    }

    window.timestamps = window.timestamps.filter(ts => ts > windowStart);

    const requestCount = window.timestamps.length;

    if (requestCount >= this.maxRequests) {
      const oldestInWindow = window.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    window.timestamps.push(now);

    return {
      allowed: true,
      remaining: this.maxRequests - window.timestamps.length,
    };
  }

  /**
   * Get current rate limit status for a company without consuming a request
   * @param company - Company identifier
   * @returns Current request count and remaining allowance
   */
  getStatus(company: string): { count: number; remaining: number; windowMs: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const window = this.windows.get(company);
    if (!window) {
      return {
        count: 0,
        remaining: this.maxRequests,
        windowMs: this.windowMs,
      };
    }

    const validTimestamps = window.timestamps.filter(ts => ts > windowStart);
    return {
      count: validTimestamps.length,
      remaining: this.maxRequests - validTimestamps.length,
      windowMs: this.windowMs,
    };
  }

  /**
   * Reset rate limit for a company (for testing or admin purposes)
   * @param company - Company identifier to reset
   */
  reset(company: string): void {
    this.windows.delete(company);
  }

  /**
   * Clear all rate limit windows
   */
  clearAll(): void {
    this.windows.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): { maxRequests: number; windowMs: number } {
    return {
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}
