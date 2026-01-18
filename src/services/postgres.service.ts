/**
 * CEDA-91: PostgreSQL Database Service
 *
 * Provides connection pool and helper methods for:
 * - Subscription persistence
 * - Stripe webhook idempotency
 *
 * Tables:
 * - subscriptions (id, customer_id, company, status, plan, timestamps)
 * - stripe_events (id, type, processed_at) -- for webhook idempotency
 */

import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function isEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

export interface SubscriptionRow {
  id: string;
  stripe_customer_id: string | null;
  org_id: string;
  status: string;
  plan: string;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  seats: number | null;
  created_at: Date;
  updated_at: Date;
}

export async function getSubscriptionByUserId(userId: string): Promise<SubscriptionRow | null> {
  if (!isEnabled()) return null;

  const result = await getPool().query<SubscriptionRow>(
    'SELECT * FROM subscriptions WHERE org_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<SubscriptionRow | null> {
  if (!isEnabled()) return null;

  const result = await getPool().query<SubscriptionRow>(
    'SELECT * FROM subscriptions WHERE stripe_customer_id = $1',
    [stripeCustomerId]
  );
  return result.rows[0] || null;
}

export async function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRow | null> {
  if (!isEnabled()) return null;

  const result = await getPool().query<SubscriptionRow>(
    'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  return result.rows[0] || null;
}

export async function upsertSubscription(
  orgId: string,
  plan: string,
  status: string,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  currentPeriodEnd?: string,
  seats?: number
): Promise<void> {
  if (!isEnabled()) return;

  const id = crypto.randomUUID();
  const now = new Date();

  await getPool().query(
    `INSERT INTO subscriptions (id, org_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, seats, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (org_id) DO UPDATE SET
       stripe_customer_id = COALESCE($3, subscriptions.stripe_customer_id),
       stripe_subscription_id = COALESCE($4, subscriptions.stripe_subscription_id),
       plan = $5,
       status = $6,
       current_period_end = COALESCE($7, subscriptions.current_period_end),
       seats = COALESCE($8, subscriptions.seats),
       updated_at = $10`,
    [
      id,
      orgId,
      stripeCustomerId || null,
      stripeSubscriptionId || null,
      plan,
      status,
      currentPeriodEnd ? new Date(currentPeriodEnd) : null,
      seats || null,
      now,
      now,
    ]
  );
}

export async function updateSubscriptionStatus(orgId: string, status: string): Promise<void> {
  if (!isEnabled()) return;

  await getPool().query(
    'UPDATE subscriptions SET status = $1, updated_at = $2 WHERE org_id = $3',
    [status, new Date(), orgId]
  );
}

export async function getAllSubscriptions(): Promise<SubscriptionRow[]> {
  if (!isEnabled()) return [];

  const result = await getPool().query<SubscriptionRow>('SELECT * FROM subscriptions');
  return result.rows;
}

export async function checkStripeEventProcessed(eventId: string): Promise<boolean> {
  if (!isEnabled()) return false;

  const result = await getPool().query(
    'SELECT id FROM stripe_events WHERE id = $1',
    [eventId]
  );
  return result.rows.length > 0;
}

export async function recordStripeEvent(eventId: string, eventType: string): Promise<void> {
  if (!isEnabled()) return;

  await getPool().query(
    'INSERT INTO stripe_events (id, type, processed_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [eventId, eventType, new Date()]
  );
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default {
  isEnabled,
  getSubscriptionByUserId,
  getSubscriptionByStripeCustomerId,
  getSubscriptionByStripeSubscriptionId,
  upsertSubscription,
  updateSubscriptionStatus,
  getAllSubscriptions,
  checkStripeEventProcessed,
  recordStripeEvent,
  withTransaction,
};
