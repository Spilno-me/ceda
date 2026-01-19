import { pgTable, text, timestamp, serial, unique } from 'drizzle-orm/pg-core';

/**
 * Playbooks - System prompts for Herald per org/project
 *
 * These define how Claude behaves when processing messages
 * from different surfaces (Telegram, Slack, Wave, etc.)
 */
export const playbooks = pgTable('playbooks', {
  id: serial('id').primaryKey(),

  // Context
  org: text('org').notNull(),
  project: text('project').notNull(),
  surface: text('surface').notNull().default('*'), // '*' = all surfaces

  // Instructions
  name: text('name').notNull(),
  instructions: text('instructions').notNull(),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by'),

}, (table) => ({
  // One playbook per org/project/surface combo
  uniqueOrgProjectSurface: unique().on(table.org, table.project, table.surface),
}));

export type Playbook = typeof playbooks.$inferSelect;
export type NewPlaybook = typeof playbooks.$inferInsert;
