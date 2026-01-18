/**
 * CEDA Reflections Schema (Drizzle ORM)
 *
 * Git-native model: user → project → org → orgs → global
 *
 * Reflections are patterns/antipatterns captured from Herald sessions.
 * Level 0 = Observation (raw capture)
 * Level 1+ = Graduated patterns
 */

import { pgTable, varchar, text, timestamp, integer, decimal, boolean, serial, index } from 'drizzle-orm/pg-core';

/**
 * Reflections table - stores Herald reflections (patterns/antipatterns)
 */
export const reflections = pgTable('reflections', {
  id: varchar('id', { length: 255 }).primaryKey(),
  session: varchar('session', { length: 1024 }).notNull(),
  feeling: varchar('feeling', { length: 50 }).notNull(), // 'stuck' | 'success'
  insight: text('insight').notNull(),
  method: varchar('method', { length: 50 }).default('direct'), // 'direct' | 'simulation'
  signal: text('signal'),
  outcome: varchar('outcome', { length: 50 }), // 'pattern' | 'antipattern'
  reinforcement: text('reinforcement'),
  warning: text('warning'),

  // Git-native context
  org: varchar('org', { length: 255 }).notNull().default('default'),
  project: varchar('project', { length: 255 }).notNull().default('default'),
  userId: varchar('user_id', { length: 255 }).notNull().default('default'),
  vault: varchar('vault', { length: 255 }),

  // Graduation model (ADR-003)
  level: integer('level').default(0), // 0=observation, 1=user, 2=project, 3=org, 4=cross-org, 5=global
  helpfulCount: integer('helpful_count').default(0),
  unhelpfulCount: integer('unhelpful_count').default(0),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orgIdx: index('idx_reflections_org').on(table.org),
  projectIdx: index('idx_reflections_project').on(table.org, table.project),
  userIdx: index('idx_reflections_user').on(table.userId),
  feelingIdx: index('idx_reflections_feeling').on(table.feeling),
  levelIdx: index('idx_reflections_level').on(table.level),
  levelOrgIdx: index('idx_reflections_level_org').on(table.level, table.org),
  createdIdx: index('idx_reflections_created').on(table.createdAt),
}));

/**
 * Pattern applications - tracks when patterns are applied and if they helped
 */
export const patternApplications = pgTable('pattern_applications', {
  id: serial('id').primaryKey(),
  reflectionId: varchar('reflection_id', { length: 255 }).notNull().references(() => reflections.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  helped: boolean('helped').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  reflectionIdx: index('idx_pattern_applications_reflection').on(table.reflectionId),
}));

// Types inferred from schema
export type Reflection = typeof reflections.$inferSelect;
export type NewReflection = typeof reflections.$inferInsert;
export type PatternApplication = typeof patternApplications.$inferSelect;
export type NewPatternApplication = typeof patternApplications.$inferInsert;
