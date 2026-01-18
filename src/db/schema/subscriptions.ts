/**
 * CEDA Subscriptions Schema (Drizzle ORM)
 *
 * Stripe billing integration
 */

import { pgTable, varchar, timestamp, uuid, integer, bigserial } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

/**
 * Subscriptions table - Stripe subscription state
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  plan: varchar('plan', { length: 50 }).notNull().default('free'), // 'free', 'pro', 'team'
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'canceled', 'past_due'
  seats: integer('seats').default(1),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Usage records - tracks usage for billing
 */
export const usageRecords = pgTable('usage_records', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  metric: varchar('metric', { length: 50 }).notNull(), // 'patterns', 'queries', 'projects'
  count: integer('count').notNull().default(0),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Stripe events - idempotency tracking for webhooks
 */
export const stripeEvents = pgTable('stripe_events', {
  id: varchar('id', { length: 255 }).primaryKey(), // Stripe event ID
  eventType: varchar('event_type', { length: 100 }).notNull(),
  processedAt: timestamp('processed_at').defaultNow(),
});

// Types inferred from schema
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type StripeEvent = typeof stripeEvents.$inferSelect;
