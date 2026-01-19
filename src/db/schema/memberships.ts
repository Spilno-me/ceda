import { pgTable, text, timestamp, serial, unique } from 'drizzle-orm/pg-core';

/**
 * Memberships - Axis MVP
 *
 * Simple membership verification:
 * - User belongs to org? → Check this table
 * - No Bayesian yet, just membership
 *
 * Trust comes later. For now: member or not.
 */
export const memberships = pgTable('memberships', {
  id: serial('id').primaryKey(),

  // Identity
  userEmail: text('user_email').notNull(),
  userProvider: text('user_provider').notNull().default('google'), // 'google', 'github'
  userId: text('user_id'), // provider-specific ID
  telegramId: text('telegram_id'), // Telegram user ID for bot verification

  // Context
  org: text('org').notNull(),
  project: text('project'), // null = access to all projects in org

  // Role
  role: text('role').notNull().default('member'), // 'admin', 'member', 'viewer'

  // Provenance
  invitedBy: text('invited_by'), // email of inviter
  trustSource: text('trust_source').default('manual'), // 'git', 'email_domain', 'invitation', 'manual'

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),

}, (table) => ({
  uniqueUserOrg: unique().on(table.userEmail, table.org),
}));

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
