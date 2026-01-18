/**
 * CEDA Reflections Repository
 *
 * Handles all reflection-related database operations.
 * Reflections are patterns/antipatterns captured from Herald sessions.
 * PostgreSQL is the source of truth, Upstash is the cache layer.
 *
 * Git-native model: user → project → org → orgs → global
 */

import { query } from './index';

/**
 * Reflection record as stored in the database
 */
export interface DbReflection {
  id: string;
  session: string;
  feeling: 'stuck' | 'success';
  insight: string;
  method: 'direct' | 'simulation';
  signal: string | null;
  outcome: 'pattern' | 'antipattern' | null;
  reinforcement: string | null;
  warning: string | null;
  org: string;
  project: string;
  user_id: string;
  vault: string | null;
  level: number;
  helpful_count: number;
  unhelpful_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new reflection
 */
export interface CreateReflectionInput {
  id: string;
  session: string;
  feeling: 'stuck' | 'success';
  insight: string;
  method?: 'direct' | 'simulation';
  signal?: string;
  outcome?: 'pattern' | 'antipattern';
  reinforcement?: string;
  warning?: string;
  org?: string;
  project?: string;
  user?: string;
  vault?: string;
  timestamp?: string;
  level?: number;
}

/**
 * Options for querying reflections
 */
export interface FindReflectionsOptions {
  project?: string;
  feeling?: 'stuck' | 'success';
  user?: string;
  minLevel?: number;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new reflection into the database
 */
export async function insert(input: CreateReflectionInput): Promise<DbReflection | null> {
  try {
    const result = await query<DbReflection>(
      `INSERT INTO reflections (
        id, session, feeling, insight, method, signal, outcome,
        reinforcement, warning, org, project, user_id, vault, level, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING *`,
      [
        input.id,
        input.session,
        input.feeling,
        input.insight,
        input.method || 'direct',
        input.signal || null,
        input.outcome || (input.feeling === 'stuck' ? 'antipattern' : 'pattern'),
        input.reinforcement || null,
        input.warning || null,
        input.org || 'default',
        input.project || 'default',
        input.user || 'default',
        input.vault || null,
        input.level || 0,
        input.timestamp ? new Date(input.timestamp) : new Date(),
      ]
    );

    console.log(`[DB:Reflections] Inserted reflection ${input.id} for ${input.org}/${input.project}`);
    return result.rows[0] || null;
  } catch (err) {
    console.error('[DB:Reflections] Insert error:', err);
    return null;
  }
}

/**
 * Find reflections by org with optional filters
 */
export async function findByOrg(
  org: string,
  options?: FindReflectionsOptions
): Promise<DbReflection[]> {
  try {
    let sql = `
      SELECT * FROM reflections
      WHERE org = $1
    `;
    const params: (string | number)[] = [org];
    let paramIndex = 2;

    if (options?.project) {
      sql += ` AND project = $${paramIndex}`;
      params.push(options.project);
      paramIndex++;
    }

    if (options?.feeling) {
      sql += ` AND feeling = $${paramIndex}`;
      params.push(options.feeling);
      paramIndex++;
    }

    if (options?.user) {
      sql += ` AND user_id = $${paramIndex}`;
      params.push(options.user);
      paramIndex++;
    }

    if (options?.minLevel !== undefined) {
      sql += ` AND level >= $${paramIndex}`;
      params.push(options.minLevel);
      paramIndex++;
    }

    sql += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await query<DbReflection>(sql, params);
    return result.rows;
  } catch (err) {
    console.error('[DB:Reflections] FindByOrg error:', err);
    return [];
  }
}

/**
 * @deprecated Use findByOrg instead. Kept for backwards compatibility during migration.
 */
export async function findByCompany(
  company: string,
  options?: FindReflectionsOptions
): Promise<DbReflection[]> {
  return findByOrg(company, options);
}

/**
 * Find a single reflection by ID
 */
export async function findById(id: string): Promise<DbReflection | null> {
  try {
    const result = await query<DbReflection>(
      'SELECT * FROM reflections WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[DB:Reflections] FindById error:', err);
    return null;
  }
}

/**
 * Delete a reflection by ID (GDPR Article 17 - Right to Erasure)
 */
export async function deleteById(id: string): Promise<boolean> {
  try {
    const result = await query(
      'DELETE FROM reflections WHERE id = $1',
      [id]
    );
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      console.log(`[DB:Reflections] Deleted reflection ${id} (GDPR erasure)`);
    }
    return deleted;
  } catch (err) {
    console.error('[DB:Reflections] Delete error:', err);
    return false;
  }
}

/**
 * Delete all reflections for a user (GDPR bulk erasure)
 */
export async function deleteByUser(
  org: string,
  project: string,
  userId: string
): Promise<number> {
  try {
    const result = await query(
      'DELETE FROM reflections WHERE org = $1 AND project = $2 AND user_id = $3',
      [org, project, userId]
    );
    const count = result.rowCount ?? 0;
    console.log(`[DB:Reflections] Deleted ${count} reflections for user ${userId} (GDPR erasure)`);
    return count;
  } catch (err) {
    console.error('[DB:Reflections] DeleteByUser error:', err);
    return 0;
  }
}

/**
 * Delete all reflections for a session
 */
export async function deleteBySession(sessionId: string): Promise<number> {
  try {
    const result = await query(
      'DELETE FROM reflections WHERE session = $1',
      [sessionId]
    );
    const count = result.rowCount ?? 0;
    console.log(`[DB:Reflections] Deleted ${count} reflections for session ${sessionId}`);
    return count;
  } catch (err) {
    console.error('[DB:Reflections] DeleteBySession error:', err);
    return 0;
  }
}

/**
 * Count reflections by org
 */
export async function countByOrg(org: string): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) FROM reflections WHERE org = $1',
      [org]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (err) {
    console.error('[DB:Reflections] CountByOrg error:', err);
    return 0;
  }
}

/**
 * @deprecated Use countByOrg instead
 */
export async function countByCompany(company: string): Promise<number> {
  return countByOrg(company);
}

/**
 * Get patterns (success reflections) for an org
 */
export async function getPatterns(
  org: string,
  options?: Omit<FindReflectionsOptions, 'feeling'>
): Promise<DbReflection[]> {
  return findByOrg(org, { ...options, feeling: 'success' });
}

/**
 * Get antipatterns (stuck reflections) for an org
 */
export async function getAntipatterns(
  org: string,
  options?: Omit<FindReflectionsOptions, 'feeling'>
): Promise<DbReflection[]> {
  return findByOrg(org, { ...options, feeling: 'stuck' });
}

/**
 * Update helpful/unhelpful counts for a reflection
 */
export async function updateFeedback(
  id: string,
  helped: boolean
): Promise<boolean> {
  try {
    const column = helped ? 'helpful_count' : 'unhelpful_count';
    const result = await query(
      `UPDATE reflections SET ${column} = ${column} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[DB:Reflections] UpdateFeedback error:', err);
    return false;
  }
}

/**
 * Update the graduation level of a reflection
 */
export async function updateLevel(id: string, level: number): Promise<boolean> {
  try {
    const result = await query(
      'UPDATE reflections SET level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [level, id]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[DB:Reflections] UpdateLevel error:', err);
    return false;
  }
}
