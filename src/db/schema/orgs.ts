/**
 * CEDA Organizations Schema (Drizzle ORM)
 *
 * Git-native model: Organizations are GitHub orgs
 * Formerly "companies" - renamed for Git alignment
 */

import { pgTable, varchar, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Organizations table - tenants in multi-tenant model
 * Maps to GitHub organizations
 */
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(), // GitHub org login
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Types inferred from schema
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
