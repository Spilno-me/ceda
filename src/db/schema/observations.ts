/**
 * CEDA Observations Schema (Drizzle ORM)
 *
 * Learning observations from predictions - used for pattern discovery
 */

import { pgTable, varchar, text, timestamp, integer, decimal, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Observations table - learning data from predictions
 */
export const observations = pgTable('observations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  patternId: varchar('pattern_id', { length: 255 }),
  outcome: varchar('outcome', { length: 50 }).notNull(), // 'accepted', 'modified', 'rejected'
  prediction: jsonb('prediction'),
  modifications: jsonb('modifications'),
  feedback: text('feedback'),
  confidence: decimal('confidence', { precision: 5, scale: 4 }),
  timingMs: integer('timing_ms'),

  // Git-native context
  org: varchar('org', { length: 255 }).notNull().default('default'),
  project: varchar('project', { length: 255 }).notNull().default('default'),
  userId: varchar('user_id', { length: 255 }).notNull().default('default'),

  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  sessionIdx: index('idx_observations_session').on(table.sessionId),
  patternIdx: index('idx_observations_pattern').on(table.patternId),
  outcomeIdx: index('idx_observations_outcome').on(table.outcome),
  orgIdx: index('idx_observations_org').on(table.org),
  createdIdx: index('idx_observations_created').on(table.createdAt),
}));

/**
 * Learned patterns table - patterns created from clustered observations
 */
export const learnedPatterns = pgTable('learned_patterns', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  structure: jsonb('structure').notNull(),
  sourceObservations: jsonb('source_observations'), // IDs of observations
  level: varchar('level', { length: 50 }).default('user'), // graduation level
  qualityScore: decimal('quality_score', { precision: 5, scale: 2 }).default('50.00'),
  usageCount: integer('usage_count').default(0),
  acceptanceRate: decimal('acceptance_rate', { precision: 5, scale: 4 }).default('0.0'),

  // Git-native context
  org: varchar('org', { length: 255 }).notNull().default('default'),
  project: varchar('project', { length: 255 }),
  userId: varchar('user_id', { length: 255 }),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  levelIdx: index('idx_learned_patterns_level').on(table.level),
  orgIdx: index('idx_learned_patterns_org').on(table.org),
  qualityIdx: index('idx_learned_patterns_quality').on(table.qualityScore),
}));

/**
 * Insights table - cross-context insights shared between sessions
 */
export const insights = pgTable('insights', {
  id: varchar('id', { length: 255 }).primaryKey(),
  fromContext: varchar('from_context', { length: 255 }).notNull(),
  toContext: varchar('to_context', { length: 255 }).notNull(),
  topic: varchar('topic', { length: 255 }),
  insight: text('insight').notNull(),
  org: varchar('org', { length: 255 }).notNull().default('default'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  toContextIdx: index('idx_insights_to_context').on(table.toContext),
  topicIdx: index('idx_insights_topic').on(table.topic),
  orgIdx: index('idx_insights_org').on(table.org),
}));

// Types inferred from schema
export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;
export type LearnedPattern = typeof learnedPatterns.$inferSelect;
export type Insight = typeof insights.$inferSelect;
