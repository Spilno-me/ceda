/**
 * CEDA Subscriptions Repository
 *
 * Handles Stripe subscription persistence and webhook idempotency.
 * Ensures billing state survives restarts.
 */

import { query, transaction } from './index';

/**
 * Subscription as stored in the database
 */
export interface DbSubscription {
  id: string; // Stripe subscription ID (sub_xxx)
  customer_id: string; // Stripe customer ID (cus_xxx)
  company: string; // CEDA company identifier
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
 * Find subscription by ID
 */
export async function findById(subscriptionId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    'SELECT * FROM subscriptions WHERE id = $1',
    [subscriptionId]
  );
  return result.rows[0] || null;
}

/**
 * Find subscription by company
 */
export async function findByCompany(company: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    `SELECT * FROM subscriptions
     WHERE company = $1 AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC
     LIMIT 1`,
    [company]
  );
  return result.rows[0] || null;
}

/**
 * Find subscription by Stripe customer ID
 */
export async function findByCustomerId(customerId: string): Promise<DbSubscription | null> {
  const result = await query<DbSubscription>(
    `SELECT * FROM subscriptions
     WHERE customer_id = $1 AND status IN ('active', 'trialing', 'past_due')
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
  subscriptionId: string,
  customerId: string,
  company: string,
  status: SubscriptionStatus,
  plan: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<DbSubscription> {
  const now = new Date();

  const result = await query<DbSubscription>(
    `INSERT INTO subscriptions (
      id, customer_id, company, status, plan,
      current_period_start, current_period_end,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    ON CONFLICT (id) DO UPDATE SET
      status = $4,
      plan = $5,
      current_period_start = COALESCE($6, subscriptions.current_period_start),
      current_period_end = COALESCE($7, subscriptions.current_period_end),
      updated_at = $8
    RETURNING *`,
    [
      subscriptionId,
      customerId,
      company,
      status,
      plan,
      periodStart || null,
      periodEnd || null,
      now,
    ]
  );

  console.log(`[DB:Subscriptions] Upserted subscription ${subscriptionId} for ${company}: ${status}`);
  return result.rows[0];
}

/**
 * Cancel subscription
 */
export async function cancel(subscriptionId: string): Promise<void> {
  const now = new Date();
  await query(
    `UPDATE subscriptions
     SET status = 'canceled', canceled_at = $1, updated_at = $1
     WHERE id = $2`,
    [now, subscriptionId]
  );
  console.log(`[DB:Subscriptions] Canceled subscription ${subscriptionId}`);
}

/**
 * Update subscription status
 */
export async function updateStatus(
  subscriptionId: string,
  status: SubscriptionStatus
): Promise<void> {
  await query(
    'UPDATE subscriptions SET status = $1, updated_at = $2 WHERE id = $3',
    [status, new Date(), subscriptionId]
  );
}

/**
 * Process a Stripe webhook event with idempotency
 * Returns true if event was processed, false if already processed
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

    // Mark as processed first (prevents race conditions)
    await client.query(
      'INSERT INTO stripe_events (id, type) VALUES ($1, $2)',
      [eventId, eventType]
    );

    // Run the handler
    const result = await handler();

    return { processed: true, result };
  });
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
    `SELECT status, COUNT(*) as count
     FROM subscriptions
     GROUP BY status`
  );

  const stats = {
    total: 0,
    active: 0,
    canceled: 0,
    pastDue: 0,
  };

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

/**
 * Check if company has active subscription
 */
export async function hasActiveSubscription(company: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM subscriptions
     WHERE company = $1 AND status IN ('active', 'trialing')`,
    [company]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Get company's current plan
 */
export async function getCompanyPlan(company: string): Promise<string> {
  const sub = await findByCompany(company);
  return sub?.plan || 'free';
}
