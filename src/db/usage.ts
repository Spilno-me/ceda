/**
 * CEDA Usage Repository
 *
 * Tracks usage metrics for billing, analytics, and rate limiting.
 * Metrics are recorded per company (tenant).
 */

import { query } from './index';
import * as companies from './orgs';

/**
 * Usage record as stored in the database
 */
export interface DbUsageRecord {
  id: number;
  company_id: string; // UUID FK to companies
  metric: string;
  count: number;
  recorded_at: Date;
}

/**
 * Available metrics to track
 */
export type UsageMetric =
  | 'predictions'       // herald_predict calls
  | 'reflections'       // herald_reflect calls
  | 'sessions'          // unique sessions
  | 'patterns_captured' // patterns stored
  | 'api_calls'         // total API calls
  | 'tokens_used';      // LLM tokens (for simulation)

/**
 * Record a usage event by company ID
 */
export async function record(
  companyId: string,
  metric: UsageMetric,
  count: number = 1
): Promise<void> {
  await query(
    `INSERT INTO usage_records (company_id, metric, count, recorded_at)
     VALUES ($1, $2, $3, NOW())`,
    [companyId, metric, count]
  );
}

/**
 * Record usage by company slug (convenience method)
 */
export async function recordBySlug(
  companySlug: string,
  metric: UsageMetric,
  count: number = 1
): Promise<void> {
  const { company } = await companies.upsertBySlug(companySlug);
  await record(company.id, metric, count);
}

/**
 * Record multiple usage events in batch
 */
export async function recordBatch(
  events: Array<{ companyId: string; metric: UsageMetric; count?: number }>
): Promise<void> {
  if (events.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  events.forEach((event, i) => {
    const offset = i * 3;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, NOW())`);
    values.push(event.companyId, event.metric, event.count || 1);
  });

  await query(
    `INSERT INTO usage_records (company_id, metric, count, recorded_at)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * Get usage for a company in a time period
 */
export async function getUsage(
  companyId: string,
  metric: UsageMetric,
  startDate: Date,
  endDate: Date = new Date()
): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM usage_records
     WHERE company_id = $1 AND metric = $2
     AND recorded_at >= $3 AND recorded_at <= $4`,
    [companyId, metric, startDate, endDate]
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Get all usage metrics for a company in a time period
 */
export async function getUsageSummary(
  companyId: string,
  startDate: Date,
  endDate: Date = new Date()
): Promise<Record<string, number>> {
  const result = await query<{ metric: string; total: string }>(
    `SELECT metric, COALESCE(SUM(count), 0) as total
     FROM usage_records
     WHERE company_id = $1
     AND recorded_at >= $2 AND recorded_at <= $3
     GROUP BY metric`,
    [companyId, startDate, endDate]
  );

  const summary: Record<string, number> = {};
  for (const row of result.rows) {
    summary[row.metric] = parseInt(row.total, 10);
  }
  return summary;
}

/**
 * Get daily usage breakdown for charts
 */
export async function getDailyUsage(
  companyId: string,
  metric: UsageMetric,
  days: number = 30
): Promise<Array<{ date: string; count: number }>> {
  const result = await query<{ date: string; count: string }>(
    `SELECT DATE(recorded_at) as date, COALESCE(SUM(count), 0) as count
     FROM usage_records
     WHERE company_id = $1 AND metric = $2
     AND recorded_at >= NOW() - INTERVAL '1 day' * $3
     GROUP BY DATE(recorded_at)
     ORDER BY date`,
    [companyId, metric, days]
  );

  return result.rows.map((row) => ({
    date: row.date,
    count: parseInt(row.count, 10),
  }));
}

/**
 * Get usage across all companies (for admin/analytics)
 */
export async function getGlobalUsage(
  metric: UsageMetric,
  startDate: Date,
  endDate: Date = new Date()
): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM usage_records
     WHERE metric = $1
     AND recorded_at >= $2 AND recorded_at <= $3`,
    [metric, startDate, endDate]
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Get top companies by usage
 */
export async function getTopCompanies(
  metric: UsageMetric,
  limit: number = 10,
  days: number = 30
): Promise<Array<{ companyId: string; count: number }>> {
  const result = await query<{ company_id: string; count: string }>(
    `SELECT company_id, COALESCE(SUM(count), 0) as count
     FROM usage_records
     WHERE metric = $1
     AND recorded_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY company_id
     ORDER BY count DESC
     LIMIT $3`,
    [metric, days, limit]
  );

  return result.rows.map((row) => ({
    companyId: row.company_id,
    count: parseInt(row.count, 10),
  }));
}

/**
 * Check if company is within usage limits
 */
export async function checkQuota(
  companyId: string,
  metric: UsageMetric,
  limit: number,
  periodDays: number = 30
): Promise<{ remaining: number; used: number; limit: number }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const used = await getUsage(companyId, metric, startDate);
  const remaining = Math.max(0, limit - used);

  return { remaining, used, limit };
}

/**
 * Clean up old usage records (for maintenance)
 */
export async function cleanupOldRecords(retentionDays: number = 90): Promise<number> {
  const result = await query(
    `DELETE FROM usage_records
     WHERE recorded_at < NOW() - INTERVAL '1 day' * $1`,
    [retentionDays]
  );
  return result.rowCount || 0;
}

/**
 * Get usage statistics
 */
export async function getStats(): Promise<{
  totalRecords: number;
  uniqueCompanies: number;
  todayRecords: number;
}> {
  const result = await query<{
    total: string;
    companies: string;
    today: string;
  }>(
    `SELECT
      COUNT(*) as total,
      COUNT(DISTINCT company_id) as companies,
      COUNT(*) FILTER (WHERE recorded_at >= CURRENT_DATE) as today
     FROM usage_records`
  );

  return {
    totalRecords: parseInt(result.rows[0].total, 10),
    uniqueCompanies: parseInt(result.rows[0].companies, 10),
    todayRecords: parseInt(result.rows[0].today, 10),
  };
}
