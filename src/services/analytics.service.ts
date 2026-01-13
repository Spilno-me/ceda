/**
 * CEDA-50: Analytics Service
 *
 * Provides company metrics and analytics data for the dashboard.
 * Aggregates data from ceda_audit, ceda_observations, ceda_patterns, and sessions.
 * Implements caching with 5 minute TTL and enforces max period of 90 days.
 */

import { Injectable } from '@nestjs/common';
import {
  CompanyAnalytics,
  AnalyticsPeriod,
  AnalyticsMetrics,
  AnalyticsTrendPoint,
  PatternUsageStats,
  ActiveUserStats,
  SystemAnalytics,
  AnalyticsQuery,
  CachedAnalytics,
} from '../interfaces';
import { AuditService, AuditEvent } from './audit.service';
import { ObservationService } from './observation.service';
import { PatternLibraryService } from './pattern-library.service';
import { SessionService } from './session.service';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PERIOD_DAYS = 90;

@Injectable()
export class AnalyticsService {
  private cache: Map<string, CachedAnalytics<unknown>> = new Map();

  constructor(
    private readonly auditService: AuditService,
    private readonly observationService: ObservationService,
    private readonly patternLibrary: PatternLibraryService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Get full company analytics for the dashboard
   */
  async getCompanyAnalytics(query: AnalyticsQuery): Promise<CompanyAnalytics> {
    const cacheKey = this.buildCacheKey('company', query);
    const cached = this.getFromCache<CompanyAnalytics>(cacheKey);
    if (cached) {
      return cached;
    }

    const { periodStart, periodEnd } = this.calculatePeriodBounds(query.period || 'week');

    const [metrics, trends, topPatterns, activeUsers] = await Promise.all([
      this.getMetrics(query),
      this.getTrends(query),
      this.getTopPatterns(query),
      this.getActiveUsers(query),
    ]);

    const analytics: CompanyAnalytics = {
      company: query.company,
      period: query.period || 'week',
      periodStart,
      periodEnd,
      metrics,
      trends,
      topPatterns,
      activeUsers,
    };

    this.setCache(cacheKey, analytics);
    return analytics;
  }

  /**
   * Get core metrics for a company
   */
  async getMetrics(query: AnalyticsQuery): Promise<AnalyticsMetrics> {
    const cacheKey = this.buildCacheKey('metrics', query);
    const cached = this.getFromCache<AnalyticsMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    const { periodStart, periodEnd } = this.calculatePeriodBounds(query.period || 'week');

    const observations = await this.observationService.getObservations({ company: query.company });
    const filteredObservations = observations.filter(
      obs => obs.timestamp >= periodStart && obs.timestamp <= periodEnd
    );

    const auditEvents = await this.auditService.getEvents(query.company);
    const filteredAuditEvents = auditEvents.filter(
      event => event.timestamp >= periodStart && event.timestamp <= periodEnd
    );

    const predictionEvents = filteredAuditEvents.filter(
      event => event.action === 'observation_captured'
    );

    const patterns = this.patternLibrary.getAllPatterns();
    const companyPatterns = patterns.filter(p => !p.company || p.company === query.company);

    const acceptedCount = filteredObservations.filter(obs => obs.outcome === 'accepted').length;
    const totalObservations = filteredObservations.length;
    const acceptanceRate = totalObservations > 0 ? acceptedCount / totalObservations : 0;

    const totalConfidence = filteredObservations.reduce((sum, obs) => sum + obs.confidence, 0);
    const avgConfidence = totalObservations > 0 ? totalConfidence / totalObservations : 0;

    const metrics: AnalyticsMetrics = {
      predictions: predictionEvents.length || filteredObservations.length,
      observations: totalObservations,
      patterns: companyPatterns.length,
      sessions: this.sessionService.getActiveSessionCount(),
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
    };

    this.setCache(cacheKey, metrics);
    return metrics;
  }

  /**
   * Get trend data over time
   */
  async getTrends(query: AnalyticsQuery): Promise<AnalyticsTrendPoint[]> {
    const cacheKey = this.buildCacheKey('trends', query);
    const cached = this.getFromCache<AnalyticsTrendPoint[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { periodStart, periodEnd } = this.calculatePeriodBounds(query.period || 'week');
    const observations = await this.observationService.getObservations({ company: query.company });

    const buckets = this.createTimeBuckets(periodStart, periodEnd, query.period || 'week');
    const trends: AnalyticsTrendPoint[] = [];

    for (const bucket of buckets) {
      const bucketObservations = observations.filter(
        obs => obs.timestamp >= bucket.start && obs.timestamp < bucket.end
      );

      const acceptedCount = bucketObservations.filter(obs => obs.outcome === 'accepted').length;
      const totalCount = bucketObservations.length;

      trends.push({
        timestamp: bucket.start,
        predictions: totalCount,
        observations: totalCount,
        acceptanceRate: totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) / 100 : 0,
      });
    }

    this.setCache(cacheKey, trends);
    return trends;
  }

  /**
   * Get top patterns by usage
   */
  async getTopPatterns(query: AnalyticsQuery, limit: number = 10): Promise<PatternUsageStats[]> {
    const cacheKey = this.buildCacheKey('patterns', query);
    const cached = this.getFromCache<PatternUsageStats[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { periodStart, periodEnd } = this.calculatePeriodBounds(query.period || 'week');
    const observations = await this.observationService.getObservations({ company: query.company });
    const filteredObservations = observations.filter(
      obs => obs.timestamp >= periodStart && obs.timestamp <= periodEnd
    );

    const patternStats = new Map<string, {
      patternId: string;
      patternName: string;
      usageCount: number;
      acceptedCount: number;
      totalConfidence: number;
    }>();

    for (const obs of filteredObservations) {
      const existing = patternStats.get(obs.patternId) || {
        patternId: obs.patternId,
        patternName: obs.patternName,
        usageCount: 0,
        acceptedCount: 0,
        totalConfidence: 0,
      };

      existing.usageCount++;
      if (obs.outcome === 'accepted') {
        existing.acceptedCount++;
      }
      existing.totalConfidence += obs.confidence;

      patternStats.set(obs.patternId, existing);
    }

    const topPatterns: PatternUsageStats[] = Array.from(patternStats.values())
      .map(stats => ({
        patternId: stats.patternId,
        patternName: stats.patternName,
        usageCount: stats.usageCount,
        acceptanceRate: stats.usageCount > 0
          ? Math.round((stats.acceptedCount / stats.usageCount) * 100) / 100
          : 0,
        avgConfidence: stats.usageCount > 0
          ? Math.round((stats.totalConfidence / stats.usageCount) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);

    this.setCache(cacheKey, topPatterns);
    return topPatterns;
  }

  /**
   * Get active users in the period
   */
  async getActiveUsers(query: AnalyticsQuery, limit: number = 10): Promise<ActiveUserStats[]> {
    const cacheKey = this.buildCacheKey('users', query);
    const cached = this.getFromCache<ActiveUserStats[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const { periodStart, periodEnd } = this.calculatePeriodBounds(query.period || 'week');
    const observations = await this.observationService.getObservations({ company: query.company });
    const filteredObservations = observations.filter(
      obs => obs.timestamp >= periodStart && obs.timestamp <= periodEnd
    );

    const userStats = new Map<string, {
      userId: string;
      predictions: number;
      observations: number;
      lastActive: Date;
    }>();

    for (const obs of filteredObservations) {
      const existing = userStats.get(obs.user) || {
        userId: obs.user,
        predictions: 0,
        observations: 0,
        lastActive: new Date(0),
      };

      existing.predictions++;
      existing.observations++;
      if (obs.timestamp > existing.lastActive) {
        existing.lastActive = obs.timestamp;
      }

      userStats.set(obs.user, existing);
    }

    const activeUsers: ActiveUserStats[] = Array.from(userStats.values())
      .sort((a, b) => b.predictions - a.predictions)
      .slice(0, limit);

    this.setCache(cacheKey, activeUsers);
    return activeUsers;
  }

  /**
   * Get system-wide analytics (admin only)
   */
  async getSystemAnalytics(): Promise<SystemAnalytics> {
    const cacheKey = 'system:analytics';
    const cached = this.getFromCache<SystemAnalytics>(cacheKey);
    if (cached) {
      return cached;
    }

    const allObservations = await this.observationService.getObservations({});
    const allPatterns = this.patternLibrary.getAllPatterns();
    const allAuditEvents = await this.auditService.getEvents();

    const companyStats = new Map<string, { predictions: number; observations: number }>();

    for (const obs of allObservations) {
      const existing = companyStats.get(obs.company) || { predictions: 0, observations: 0 };
      existing.predictions++;
      existing.observations++;
      companyStats.set(obs.company, existing);
    }

    const acceptedCount = allObservations.filter(obs => obs.outcome === 'accepted').length;
    const totalObservations = allObservations.length;
    const acceptanceRate = totalObservations > 0 ? acceptedCount / totalObservations : 0;

    const totalConfidence = allObservations.reduce((sum, obs) => sum + obs.confidence, 0);
    const avgConfidence = totalObservations > 0 ? totalConfidence / totalObservations : 0;

    const topCompanies = Array.from(companyStats.entries())
      .map(([company, stats]) => ({
        company,
        predictions: stats.predictions,
        observations: stats.observations,
      }))
      .sort((a, b) => b.predictions - a.predictions)
      .slice(0, 10);

    const systemAnalytics: SystemAnalytics = {
      totalCompanies: companyStats.size,
      totalPatterns: allPatterns.length,
      totalObservations,
      totalSessions: this.sessionService.getActiveSessionCount(),
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      topCompanies,
    };

    this.setCache(cacheKey, systemAnalytics);
    return systemAnalytics;
  }

  /**
   * Calculate period bounds based on period type
   */
  private calculatePeriodBounds(period: AnalyticsPeriod): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodEnd = now;
    let periodStart: Date;

    switch (period) {
      case 'day':
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const maxPeriodStart = new Date(now.getTime() - MAX_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    if (periodStart < maxPeriodStart) {
      periodStart = maxPeriodStart;
    }

    return { periodStart, periodEnd };
  }

  /**
   * Create time buckets for trend data
   */
  private createTimeBuckets(
    start: Date,
    end: Date,
    period: AnalyticsPeriod
  ): { start: Date; end: Date }[] {
    const buckets: { start: Date; end: Date }[] = [];
    let bucketSize: number;

    switch (period) {
      case 'day':
        bucketSize = 60 * 60 * 1000; // 1 hour
        break;
      case 'week':
        bucketSize = 24 * 60 * 60 * 1000; // 1 day
        break;
      case 'month':
        bucketSize = 24 * 60 * 60 * 1000; // 1 day
        break;
      default:
        bucketSize = 24 * 60 * 60 * 1000;
    }

    let current = new Date(start.getTime());
    while (current < end) {
      const bucketEnd = new Date(Math.min(current.getTime() + bucketSize, end.getTime()));
      buckets.push({ start: new Date(current), end: bucketEnd });
      current = bucketEnd;
    }

    return buckets;
  }

  /**
   * Build cache key from query parameters
   */
  private buildCacheKey(type: string, query: AnalyticsQuery): string {
    return `${type}:${query.company}:${query.period || 'week'}`;
  }

  /**
   * Get data from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    const now = new Date();
    if (now.getTime() - cached.cachedAt.getTime() > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      cachedAt: new Date(),
      key,
    });
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
