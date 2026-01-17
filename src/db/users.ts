/**
 * CEDA Users Repository
 *
 * Handles all user-related database operations.
 * Users are created via GitHub OAuth and persist across sessions.
 */

import { query, transaction } from './index';
import { v4 as uuidv4 } from 'uuid';

/**
 * User record as stored in the database
 */
export interface DbUser {
  id: string;
  github_id: number;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
  company: string | null;
  access_token: string | null;
  refresh_token: string | null;
  roles: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date;
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
    'SELECT * FROM users WHERE github_id = $1',
    [githubId]
  );
  return result.rows[0] || null;
}

/**
 * Find user by internal ID
 */
export async function findById(id: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find user by GitHub login
 */
export async function findByGitHubLogin(login: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT * FROM users WHERE github_login = $1',
    [login]
  );
  return result.rows[0] || null;
}

/**
 * Find user by email
 */
export async function findByEmail(email: string): Promise<DbUser | null> {
  const result = await query<DbUser>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Create or update user from GitHub OAuth
 * Returns the user and whether they are new
 */
export async function upsertFromGitHub(
  input: GitHubUserInput
): Promise<{ user: DbUser; isNew: boolean }> {
  return transaction(async (client) => {
    // Check if user exists
    const existing = await client.query<DbUser>(
      'SELECT * FROM users WHERE github_id = $1',
      [input.githubId]
    );

    const isNew = existing.rows.length === 0;
    const now = new Date();
    let user: DbUser;

    if (isNew) {
      // Create new user
      const id = uuidv4();
      const company = input.organizations?.[0]?.login || input.githubLogin;

      const result = await client.query<DbUser>(
        `INSERT INTO users (
          id, github_id, github_login, email, avatar_url, company,
          access_token, roles, is_active, created_at, updated_at, last_login_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10)
        RETURNING *`,
        [
          id,
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          company,
          input.accessToken,
          ['contributor'],
          true,
          now,
        ]
      );
      user = result.rows[0];

      console.log(`[DB:Users] Created new user: ${input.githubLogin} (${id})`);
    } else {
      // Update existing user
      const result = await client.query<DbUser>(
        `UPDATE users SET
          github_login = $2,
          email = COALESCE($3, email),
          avatar_url = COALESCE($4, avatar_url),
          access_token = $5,
          updated_at = $6,
          last_login_at = $6
        WHERE github_id = $1
        RETURNING *`,
        [
          input.githubId,
          input.githubLogin,
          input.email || null,
          input.avatarUrl || null,
          input.accessToken,
          now,
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

      // Update company to first org if user is new or has no company
      if (isNew || !user.company) {
        await client.query(
          'UPDATE users SET company = $1 WHERE id = $2',
          [input.organizations[0].login, user.id]
        );
        user.company = input.organizations[0].login;
      }
    }

    return { user, isNew };
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
 * Update user's company (primary organization)
 */
export async function updateCompany(userId: string, company: string): Promise<void> {
  await query(
    'UPDATE users SET company = $1, updated_at = $2 WHERE id = $3',
    [company, new Date(), userId]
  );
}

/**
 * Update user's roles
 */
export async function updateRoles(userId: string, roles: string[]): Promise<void> {
  await query(
    'UPDATE users SET roles = $1, updated_at = $2 WHERE id = $3',
    [roles, new Date(), userId]
  );
}

/**
 * Deactivate user
 */
export async function deactivate(userId: string): Promise<void> {
  await query(
    'UPDATE users SET is_active = false, updated_at = $1 WHERE id = $2',
    [new Date(), userId]
  );
}

/**
 * Get users by company
 */
export async function findByCompany(company: string): Promise<DbUser[]> {
  const result = await query<DbUser>(
    'SELECT * FROM users WHERE company = $1 AND is_active = true ORDER BY created_at',
    [company]
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
