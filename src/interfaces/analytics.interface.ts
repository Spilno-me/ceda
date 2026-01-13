/**
 * CEDA-50: Analytics Dashboard Interfaces
 *
 * Defines types for company analytics and metrics aggregation.
 * Used by AnalyticsService to provide dashboard data.
 */

/**
 * Time period for analytics aggregation
 */
export type AnalyticsPeriod = 'day' | 'week' | 'month';

/**
 * Core metrics for a company
 */
export interface AnalyticsMetrics {
  /** Total predictions made */
  predictions: number;
  /** Total observations captured */
  observations: number;
  /** Total patterns used */
  patterns: number;
  /** Total sessions */
  sessions: number;
  /** Rate of accepted predictions (0-1) */
  acceptanceRate: number;
  /** Average confidence score (0-1) */
  avgConfidence: number;
}

/**
 * Trend data point for time series
 */
export interface AnalyticsTrendPoint {
  /** Date/time of the data point */
  timestamp: Date;
  /** Number of predictions at this point */
  predictions: number;
  /** Number of observations at this point */
  observations: number;
  /** Acceptance rate at this point */
  acceptanceRate: number;
}

/**
 * Pattern usage statistics
 */
export interface PatternUsageStats {
  /** Pattern ID */
  patternId: string;
  /** Pattern name */
  patternName: string;
  /** Number of times used */
  usageCount: number;
  /** Acceptance rate for this pattern */
  acceptanceRate: number;
  /** Average confidence for this pattern */
  avgConfidence: number;
}

/**
 * Active user statistics
 */
export interface ActiveUserStats {
  /** User identifier */
  userId: string;
  /** Number of predictions made */
  predictions: number;
  /** Number of observations captured */
  observations: number;
  /** Last activity timestamp */
  lastActive: Date;
}

/**
 * Full company analytics response
 */
export interface CompanyAnalytics {
  /** Company identifier */
  company: string;
  /** Time period for aggregation */
  period: AnalyticsPeriod;
  /** Start of the analytics period */
  periodStart: Date;
  /** End of the analytics period */
  periodEnd: Date;
  /** Core metrics */
  metrics: AnalyticsMetrics;
  /** Trend data over time */
  trends: AnalyticsTrendPoint[];
  /** Top patterns by usage */
  topPatterns: PatternUsageStats[];
  /** Active users in the period */
  activeUsers: ActiveUserStats[];
}

/**
 * System-wide analytics (admin only)
 */
export interface SystemAnalytics {
  /** Total companies */
  totalCompanies: number;
  /** Total patterns across all companies */
  totalPatterns: number;
  /** Total observations across all companies */
  totalObservations: number;
  /** Total sessions across all companies */
  totalSessions: number;
  /** System-wide acceptance rate */
  acceptanceRate: number;
  /** System-wide average confidence */
  avgConfidence: number;
  /** Top companies by activity */
  topCompanies: {
    company: string;
    predictions: number;
    observations: number;
  }[];
}

/**
 * Analytics query parameters
 */
export interface AnalyticsQuery {
  /** Company identifier (required for non-admin endpoints) */
  company: string;
  /** Time period for aggregation */
  period?: AnalyticsPeriod;
  /** Custom start date (optional, overrides period) */
  startDate?: Date;
  /** Custom end date (optional, overrides period) */
  endDate?: Date;
}

/**
 * Cached analytics entry
 */
export interface CachedAnalytics<T> {
  /** Cached data */
  data: T;
  /** Cache timestamp */
  cachedAt: Date;
  /** Cache key */
  key: string;
}
