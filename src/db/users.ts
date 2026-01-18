/**
 * CEDA Users Repository
 *
 * Handles all user-related database operations.
 * Users are created via GitHub OAuth and persist across sessions.
 * Access tokens are encrypted using pgcrypto.
 */

import { query, transaction } from './index';
import * as companies from './orgs';

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
  primary_org_id: string | null; // UUID FK to orgs
  created_at: Date;
  updated_at: Date;
  last_login_at: Date;
}

/** @deprecated Use DbUser with primary_org_id */
export interface DbUserLegacy extends DbUser {
  company_id?: string | null;
}

/**
 * User with decrypted access token (for internal use only)
 */
export interface DbUserWithToken extends DbUser {
  access_token: string | null;
}

/**
 * User organization membership (user_orgs joined with orgs)
 */
export interface DbUserOrg {
  user_id: string;
  org_id: string; // UUID FK to orgs
  org_slug: string; // From orgs table
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
    'SELECT id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at FROM users WHERE github_id = $1',
    [githubId]
  );
  return result.rows[0] || null;
}

/**
 * Find user by internal ID
 */
export async function findById(id: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find user by GitHub login
 */
export async function findByGitHubLogin(login: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at FROM users WHERE github_login = $1',
    [login]
  );
  return result.rows[0] || null;
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Get user's decrypted access token (use sparingly)
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  // Note: access_token_enc stores plain text for now (encrypted later if needed)
  const result = await query<{ access_token_enc: string | null }>(
    `SELECT access_token_enc FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0]?.access_token_enc || null;
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

    // Ensure org exists
    const { org } = await companies.upsertBySlug(companySlug);

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
          github_id, github_login, email, avatar_url, primary_org_id,
          access_token_enc
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
        RETURNING id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at`,
        [
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          org.id,
          input.accessToken, // Store plain for now, encrypt later if needed
        ]
      );
      user = result.rows[0];

      console.log(`[DB:Users] Created new user: ${input.githubLogin} (org: ${companySlug})`);
    } else {
      // Update existing user
      const result = await client.query<DbUser>(
        `UPDATE users SET
          github_login = $2,
          email = COALESCE($3, email),
          avatar_url = COALESCE($4, avatar_url),
          access_token_enc = $5,
          updated_at = NOW(),
          last_login_at = NOW()
        WHERE github_id = $1
        RETURNING id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at`,
        [
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          input.accessToken,
        ]
      );
      user = result.rows[0];

      console.log(`[DB:Users] Updated user: ${input.githubLogin}`);
    }

    // Sync organizations using user_orgs junction table
    if (input.organizations && input.organizations.length > 0) {
      // Remove old org memberships
      await client.query(
        'DELETE FROM user_orgs WHERE user_id = $1',
        [user.id]
      );

      // Insert new org memberships
      for (const ghOrg of input.organizations) {
        // Ensure org exists
        const { org: cedaOrg } = await companies.upsertBySlug(ghOrg.login);
        await client.query(
          `INSERT INTO user_orgs (user_id, org_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [user.id, cedaOrg.id, 'member']
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
    `SELECT uo.user_id, uo.org_id, o.slug as org_slug, uo.role
     FROM user_orgs uo
     JOIN orgs o ON uo.org_id = o.id
     WHERE uo.user_id = $1`,
    [userId]
  );
  return result.rows;
}

/**
 * Update user's primary org
 */
export async function updatePrimaryOrg(userId: string, orgId: string): Promise<void> {
  await query(
    'UPDATE users SET primary_org_id = $1, updated_at = NOW() WHERE id = $2',
    [orgId, userId]
  );
}

/** @deprecated Use updatePrimaryOrg instead */
export const updateCompany = updatePrimaryOrg;

// Note: roles and is_active removed from schema - use user_orgs for role management

/**
 * Get users by org
 */
export async function findByOrgId(orgId: string): Promise<DbUser[]> {
  const result = await query<DbUser>(
    `SELECT id, github_id, github_login, email, avatar_url, primary_org_id, created_at, updated_at, last_login_at
     FROM users WHERE primary_org_id = $1 ORDER BY created_at`,
    [orgId]
  );
  return result.rows;
}

/** @deprecated Use findByOrgId instead */
export const findByCompanyId = findByOrgId;

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
     WHERE last_login_at > NOW() - INTERVAL '1 day' * $1`,
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
