/**
 * CEDA Database Repositories
 *
 * Unified export for all database operations.
 * Import from here for clean access to all repositories.
 */

// Core database utilities
export {
  getPool,
  query,
  transaction,
  healthCheck,
  closePool,
} from './index';

// User repository
export * as users from './users';
export type { DbUser, DbUserOrg, GitHubUserInput } from './users';

// Subscription repository
export * as subscriptions from './subscriptions';
export type { DbSubscription, DbStripeEvent, SubscriptionStatus } from './subscriptions';

// Usage repository
export * as usage from './usage';
export type { DbUsageRecord, UsageMetric } from './usage';
