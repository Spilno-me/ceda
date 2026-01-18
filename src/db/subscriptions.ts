/**
 * CEDA Subscriptions Repository
 *
 * Handles Stripe subscription persistence and webhook idempotency.
 * Subscriptions are linked to orgs (tenants).
 */

import { query, transaction } from './index';
import * as companies from './orgs';

/**
 * Subscription as stored in the database
 */
export interface DbSubscription {
  id: string; // UUID
  stripe_subscription_id: string;
  stripe_customer_id: string;
  org_id: string; // UUID FK to orgs
  status: SubscriptionStatus;
  plan: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  canceled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired';

/**
 * Stripe event for idempotency
 */
export interface DbStripeEvent {
  id: string;
  type: string;
  processed_at: Date;
}

/**
 * Check if a Stripe event has already been processed
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    'SELECT id FROM stripe_events WHERE id = $1',
    [eventId]
  );
  return result.rows.length > 0;
}

/**
 * Mark a Stripe event as processed
 */
export async function markEventProcessed(
  eventId: string,
  eventType: string
): Promise<void> {
  await query(
    'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [eventId, eventType]
  );
}

/**
 * Find subscription by internal ID
 */
export async function findById(subscriptionId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    'SELECT * FROM subscriptions WHERE id = $1',
    [subscriptionId]
  );
  return result.rows[0] || null;
}

/**
 * Find subscription by Stripe subscription ID
 */
export async function findByStripeId(stripeSubscriptionId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );
  return result.rows[0] || null;
}

/**
 * Find active subscription by company ID
 */
export async function findByCompanyId(companyId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    `SELECT * FROM subscriptions
     WHERE org_id = $1 AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyId]
  );
  return result.rows[0] || null;
}

/**
 * Find subscription by company slug (convenience method)
 */
export async function findByCompanySlug(companySlug: string): Promise<DbSubscription | null> {
  const company = await companies.findBySlug(companySlug);
  if (!company) return null;
  return findByCompanyId(company.id);
}

/**
 * Find subscription by Stripe customer ID
 */
export async function findByStripeCustomerId(customerId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    `SELECT * FROM subscriptions
     WHERE stripe_customer_id = $1 AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId]
  );
  return result.rows[0] || null;
}

/**
 * Create or update subscription from Stripe webhook
 */
export async function upsertFromStripe(
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  companyId: string,
  status: SubscriptionStatus,
  plan: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<DbSubscription> {
  // Check if exists by Stripe subscription ID
  const existing = await findByStripeId(stripeSubscriptionId);

  if (existing) {
    // Update existing
    const result = await query<DbSubscription>(
      `UPDATE subscriptions SET
        status = $2,
        plan = $3,
        current_period_start = COALESCE($4, current_period_start),
        current_period_end = COALESCE($5, current_period_end),
        updated_at = NOW()
      WHERE stripe_subscription_id = $1
      RETURNING *`,
      [stripeSubscriptionId, status, plan, periodStart || null, periodEnd || null]
    );
    console.log(`[DB:Subscriptions] Updated subscription ${stripeSubscriptionId}: ${status}`);
    return result.rows[0];
  } else {
    // Create new
    const result = await query<DbSubscription>(
      `INSERT INTO subscriptions (
        stripe_subscription_id, stripe_customer_id, org_id,
        status, plan, current_period_start, current_period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        stripeSubscriptionId,
        stripeCustomerId,
        companyId,
        status,
        plan,
        periodStart || null,
        periodEnd || null,
      ]
    );
    console.log(`[DB:Subscriptions] Created subscription ${stripeSubscriptionId} for company ${companyId}`);
    return result.rows[0];
  }
}

/**
 * Cancel subscription
 */
export async function cancel(stripeSubscriptionId: string): Promise<void> {
  await query(
    `UPDATE subscriptions
     SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  console.log(`[DB:Subscriptions] Canceled subscription ${stripeSubscriptionId}`);
}

/**
 * Update subscription status
 */
export async function updateStatus(
  stripeSubscriptionId: string,
  status: SubscriptionStatus
): Promise<void> {
  await query(
    'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2',
    [status, stripeSubscriptionId]
  );
}

/**
 * Process a Stripe webhook event with idempotency
 */
export async function processWebhookEvent<T>(
  eventId: string,
  eventType: string,
  handler: () => Promise<T>
): Promise<{ processed: boolean; result?: T }> {
  return transaction(async (client) => {
    // Check idempotency
    const existing = await client.query(
      'SELECT id FROM stripe_events WHERE id = $1',
      [eventId]
    );

    if (existing.rows.length > 0) {
      console.log(`[DB:Subscriptions] Event ${eventId} already processed, skipping`);
      return { processed: false };
    }

    // Mark as processed first
    await client.query(
      'INSERT INTO stripe_events (id, type) VALUES ($1, $2)',
      [eventId, eventType]
    );

    // Run handler
    const result = await handler();
    return { processed: true, result };
  });
}

/**
 * Check if company has active subscription
 */
export async function hasActiveSubscription(companyId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM subscriptions
     WHERE org_id = $1 AND status IN ('active', 'trialing')`,
    [companyId]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Get company's current plan (by company ID)
 */
export async function getCompanyPlan(companyId: string): Promise<string> {
  const sub = await findByCompanyId(companyId);
  return sub?.plan || 'free';
}

/**
 * Get subscription stats
 */
export async function getStats(): Promise<{
  total: number;
  active: number;
  canceled: number;
  pastDue: number;
}> {
  const result = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count FROM subscriptions GROUP BY status`
  );

  const stats = { total: 0, active: 0, canceled: 0, pastDue: 0 };

  for (const row of result.rows) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    switch (row.status) {
      case 'active':
      case 'trialing':
        stats.active += count;
        break;
      case 'canceled':
        stats.canceled += count;
        break;
      case 'past_due':
      case 'unpaid':
        stats.pastDue += count;
        break;
    }
  }

  return stats;
}
