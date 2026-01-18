/**
 * CEDA Usage Repository
 *
 * Tracks usage metrics for billing, analytics, and rate limiting.
 * Metrics are recorded per org (tenant).
 */

import { query } from './index';
import * as orgs from './orgs';

/**
 * Usage record as stored in the database
 */
export interface DbUsageRecord {
  id: number;
  org_id: string; // UUID FK to orgs
  metric: string;
  count: number;
  period_start: Date;
  period_end: Date;
  created_at: Date;
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
 * Record a usage event by org ID
 */
export async function record(
  orgId: string,
  metric: UsageMetric,
  count: number = 1
): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of month

  await query(
    `INSERT INTO usage_records (org_id, metric, count, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5)`,
    [orgId, metric, count, periodStart, periodEnd]
  );
}

/**
 * Record usage by org slug (convenience method)
 */
export async function recordBySlug(
  orgSlug: string,
  metric: UsageMetric,
  count: number = 1
): Promise<void> {
  const { org } = await orgs.upsertBySlug(orgSlug);
  await record(org.id, metric, count);
}

/**
 * Record multiple usage events in batch
 */
export async function recordBatch(
  events: Array<{ orgId: string; metric: UsageMetric; count?: number }>
): Promise<void> {
  if (events.length === 0) return;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const values: any[] = [];
  const placeholders: string[] = [];

  events.forEach((event, i) => {
    const offset = i * 5;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
    values.push(event.orgId, event.metric, event.count || 1, periodStart, periodEnd);
  });

  await query(
    `INSERT INTO usage_records (org_id, metric, count, period_start, period_end)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * Get usage for an org in a time period
 */
export async function getUsage(
  orgId: string,
  metric: UsageMetric,
  startDate: Date,
  endDate: Date = new Date()
): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM usage_records
     WHERE org_id = $1 AND metric = $2
     AND created_at >= $3 AND created_at <= $4`,
    [orgId, metric, startDate, endDate]
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Get all usage metrics for an org in a time period
 */
export async function getUsageSummary(
  orgId: string,
  startDate: Date,
  endDate: Date = new Date()
): Promise<Record<string, number>> {
  const result = await query<{ metric: string; total: string }>(
    `SELECT metric, COALESCE(SUM(count), 0) as total
     FROM usage_records
     WHERE org_id = $1
     AND created_at >= $2 AND created_at <= $3
     GROUP BY metric`,
    [orgId, startDate, endDate]
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
  orgId: string,
  metric: UsageMetric,
  days: number = 30
): Promise<Array<{ date: string; count: number }>> {
  const result = await query<{ date: string; count: string }>(
    `SELECT DATE(created_at) as date, COALESCE(SUM(count), 0) as count
     FROM usage_records
     WHERE org_id = $1 AND metric = $2
     AND created_at >= NOW() - INTERVAL '1 day' * $3
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [orgId, metric, days]
  );

  return result.rows.map((row) => ({
    date: row.date,
    count: parseInt(row.count, 10),
  }));
}

/**
 * Get usage across all orgs (for admin/analytics)
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
     AND created_at >= $2 AND created_at <= $3`,
    [metric, startDate, endDate]
  );
  return parseInt(result.rows[0].total, 10);
}

/**
 * Get top orgs by usage
 */
export async function getTopOrgs(
  metric: UsageMetric,
  limit: number = 10,
  days: number = 30
): Promise<Array<{ orgId: string; count: number }>> {
  const result = await query<{ org_id: string; count: string }>(
    `SELECT org_id, COALESCE(SUM(count), 0) as count
     FROM usage_records
     WHERE metric = $1
     AND created_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY org_id
     ORDER BY count DESC
     LIMIT $3`,
    [metric, days, limit]
  );

  return result.rows.map((row) => ({
    orgId: row.org_id,
    count: parseInt(row.count, 10),
  }));
}

/** @deprecated Use getTopOrgs instead */
export const getTopCompanies = getTopOrgs;

/**
 * Check if org is within usage limits
 */
export async function checkQuota(
  orgId: string,
  metric: UsageMetric,
  limit: number,
  periodDays: number = 30
): Promise<{ remaining: number; used: number; limit: number }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const used = await getUsage(orgId, metric, startDate);
  const remaining = Math.max(0, limit - used);

  return { remaining, used, limit };
}

/**
 * Clean up old usage records (for maintenance)
 */
export async function cleanupOldRecords(retentionDays: number = 90): Promise<number> {
  const result = await query(
    `DELETE FROM usage_records
     WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [retentionDays]
  );
  return result.rowCount || 0;
}

/**
 * Get usage statistics
 */
export async function getStats(): Promise<{
  totalRecords: number;
  uniqueOrgs: number;
  todayRecords: number;
}> {
  const result = await query<{
    total: string;
    orgs: string;
    today: string;
  }>(
    `SELECT
      COUNT(*) as total,
      COUNT(DISTINCT org_id) as orgs,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today
     FROM usage_records`
  );

  return {
    totalRecords: parseInt(result.rows[0].total, 10),
    uniqueOrgs: parseInt(result.rows[0].orgs, 10),
    todayRecords: parseInt(result.rows[0].today, 10),
  };
}
