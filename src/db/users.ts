/**
 * CEDA Users Repository
 *
 * Handles all user-related database operations.
 * Users are created via GitHub OAuth and persist across sessions.
 * Access tokens are encrypted using pgcrypto.
 */

import { query, transaction } from './index';
import * as companies from './companies';

// Encryption key from environment - MUST be set in production
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'ceda-dev-key-change-in-prod';

/**
 * User record as stored in the database
 */
export interface DbUser {
  id: string; // UUID
  github_id: number;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
  company_id: string | null; // UUID FK to companies
  roles: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date;
}

/**
 * User with decrypted access token (for internal use only)
 */
export interface DbUserWithToken extends DbUser {
  access_token: string | null;
}

/**
 * User organization membership
 */
export interface DbUserOrg {
  user_id: string;
  org_login: string;
  org_id: number;
  role: string;
}

/**
 * Input for creating/updating a user from GitHub OAuth
 */
export interface GitHubUserInput {
  githubId: number;
  githubLogin: string;
  email?: string | null;
  avatarUrl?: string | null;
  accessToken: string;
  organizations?: Array<{ login: string; id: number }>;
}

/**
 * Find user by GitHub ID
 */
export async function findByGitHubId(githubId: number): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at FROM users WHERE github_id = $1',
    [githubId]
  );
  return result.rows[0] || null;
}

/**
 * Find user by internal ID
 */
export async function findById(id: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find user by GitHub login
 */
export async function findByGitHubLogin(login: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at FROM users WHERE github_login = $1',
    [login]
  );
  return result.rows[0] || null;
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Get user's decrypted access token (use sparingly)
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const result = await query<{ token: string | null }>(
    `SELECT pgp_sym_decrypt(access_token_encrypted, $1) as token
     FROM users WHERE id = $2`,
    [ENCRYPTION_KEY, userId]
  );
  return result.rows[0]?.token || null;
}

/**
 * Create or update user from GitHub OAuth
 * Returns the user and whether they are new
 */
export async function upsertFromGitHub(
  input: GitHubUserInput
): Promise<{ user: DbUser; isNew: boolean; companySlug: string }> {
  return transaction(async (client) => {
    // Determine company from first org or username
    const companySlug = input.organizations?.[0]?.login || input.githubLogin;

    // Ensure company exists
    const { company } = await companies.upsertBySlug(companySlug);

    // Check if user exists
    const existing = await client.query<DbUser>(
      'SELECT * FROM users WHERE github_id = $1',
      [input.githubId]
    );

    const isNew = existing.rows.length === 0;
    let user: DbUser;

    if (isNew) {
      // Create new user with encrypted token
      const result = await client.query<DbUser>(
        `INSERT INTO users (
          github_id, github_login, email, avatar_url, company_id,
          access_token_encrypted, roles, is_active
        ) VALUES (
          $1, $2, $3, $4, $5,
          pgp_sym_encrypt($6, $7),
          $8, $9
        )
        RETURNING id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at`,
        [
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          company.id,
          input.accessToken,
          ENCRYPTION_KEY,
          ['contributor'],
          true,
        ]
      );
      user = result.rows[0];

      console.log(`[DB:Users] Created new user: ${input.githubLogin} (company: ${companySlug})`);
    } else {
      // Update existing user with new encrypted token
      const result = await client.query<DbUser>(
        `UPDATE users SET
          github_login = $2,
          email = COALESCE($3, email),
          avatar_url = COALESCE($4, avatar_url),
          access_token_encrypted = pgp_sym_encrypt($5, $6),
          updated_at = NOW(),
          last_login_at = NOW()
        WHERE github_id = $1
        RETURNING id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at`,
        [
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          input.accessToken,
          ENCRYPTION_KEY,
        ]
      );
      user = result.rows[0];

      console.log(`[DB:Users] Updated user: ${input.githubLogin}`);
    }

    // Sync organizations
    if (input.organizations && input.organizations.length > 0) {
      // Remove old orgs
      await client.query(
        'DELETE FROM user_organizations WHERE user_id = $1',
        [user.id]
      );

      // Insert new orgs
      for (const org of input.organizations) {
        await client.query(
          `INSERT INTO user_organizations (user_id, org_login, org_id, role)
           VALUES ($1, $2, $3, $4)`,
          [user.id, org.login, org.id, 'member']
        );
      }
    }

    return { user, isNew, companySlug };
  });
}

/**
 * Get user's organizations
 */
export async function getUserOrganizations(userId: string): Promise<DbUserOrg[]> {
  const result = await query<DbUserOrg>(
    'SELECT * FROM user_organizations WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

/**
 * Update user's company
 */
export async function updateCompany(userId: string, companyId: string): Promise<void> {
  await query(
    'UPDATE users SET company_id = $1, updated_at = NOW() WHERE id = $2',
    [companyId, userId]
  );
}

/**
 * Update user's roles
 */
export async function updateRoles(userId: string, roles: string[]): Promise<void> {
  await query(
    'UPDATE users SET roles = $1, updated_at = NOW() WHERE id = $2',
    [roles, userId]
  );
}

/**
 * Deactivate user
 */
export async function deactivate(userId: string): Promise<void> {
  await query(
    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
    [userId]
  );
}

/**
 * Get users by company
 */
export async function findByCompanyId(companyId: string): Promise<DbUser[]> {
  const result = await query<DbUser>(
    `SELECT id, github_id, github_login, email, avatar_url, company_id, roles, is_active, created_at, updated_at, last_login_at
     FROM users WHERE company_id = $1 AND is_active = true ORDER BY created_at`,
    [companyId]
  );
  return result.rows;
}

/**
 * Count total users
 */
export async function countUsers(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*) FROM users');
  return parseInt(result.rows[0].count, 10);
}

/**
 * Count active users in last N days
 */
export async function countActiveUsers(days: number = 30): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM users
     WHERE last_login_at > NOW() - INTERVAL '1 day' * $1
     AND is_active = true`,
    [days]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * User preferences type
 */
export interface UserPreferences {
  defaultOrg?: string;
  defaultProject?: string;
  selectedRepos?: string[];
  customTags?: string[];
  [key: string]: unknown;
}

/**
 * Get user preferences from PlanetScale (CEDA-42)
 */
export async function getPreferences(userId: string): Promise<UserPreferences> {
  try {
    const result = await query<{ preferences: UserPreferences | string | null }>(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );
    
    const prefs = result.rows[0]?.preferences;
    if (!prefs) return {};
    
    // Handle both JSON object and string (depending on DB driver)
    if (typeof prefs === 'string') {
      try {
        return JSON.parse(prefs);
      } catch {
        return {};
      }
    }
    
    return prefs;
  } catch (err) {
    console.error('[DB:Users] GetPreferences error:', err);
    return {};
  }
}

/**
 * Set user preferences in PlanetScale (CEDA-42)
 */
export async function setPreferences(userId: string, preferences: UserPreferences): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(preferences), userId]
    );
    
    const updated = (result.rowCount ?? 0) > 0;
    if (updated) {
      console.log(`[DB:Users] Updated preferences for user ${userId}`);
    }
    return updated;
  } catch (err) {
    console.error('[DB:Users] SetPreferences error:', err);
    return false;
  }
}
