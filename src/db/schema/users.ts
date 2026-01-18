/**
 * CEDA Users Schema (Drizzle ORM)
 *
 * Git-native model: Users are GitHub users
 */

import { pgTable, varchar, timestamp, uuid, text, jsonb } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

/**
 * Users table - authenticated users via GitHub OAuth
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: varchar('github_id', { length: 255 }).notNull().unique(),
  githubLogin: varchar('github_login', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 1024 }),

  // Primary org association
  primaryOrgId: uuid('primary_org_id').references(() => orgs.id),

  // User preferences (JSONB for flexibility)
  preferences: jsonb('preferences').$type<{
    defaultOrg?: string;
    defaultProject?: string;
    selectedRepos?: string[];
    theme?: 'light' | 'dark';
  }>(),

  // Encrypted GitHub access token
  accessTokenEnc: text('access_token_enc'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});

/**
 * User-Organization memberships
 * Tracks which orgs a user belongs to
 */
export const userOrgs = pgTable('user_orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('member'), // 'owner', 'admin', 'member'
  createdAt: timestamp('created_at').defaultNow(),
});

// Types inferred from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserOrg = typeof userOrgs.$inferSelect;
export type NewUserOrg = typeof userOrgs.$inferInsert;
