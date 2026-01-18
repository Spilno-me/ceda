/**
 * CEDA Reflections Repository
 *
 * Handles all reflection-related database operations.
 * Reflections are patterns/antipatterns captured from Herald sessions.
 * PlanetScale is the source of truth, Upstash is the cache layer.
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
  company: string;
  project: string;
  user_id: string;
  vault: string | null;
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
  company?: string;
  project?: string;
  user?: string;
  vault?: string;
  timestamp?: string;
}

/**
 * Options for querying reflections
 */
export interface FindReflectionsOptions {
  project?: string;
  feeling?: 'stuck' | 'success';
  user?: string;
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
        reinforcement, warning, company, project, user_id, vault, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
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
        input.company || 'default',
        input.project || 'default',
        input.user || 'default',
        input.vault || null,
        input.timestamp ? new Date(input.timestamp) : new Date(),
      ]
    );
    
    console.log(`[DB:Reflections] Inserted reflection ${input.id} for ${input.company}/${input.project}`);
    return result.rows[0] || null;
  } catch (err) {
    console.error('[DB:Reflections] Insert error:', err);
    return null;
  }
}

/**
 * Find reflections by company with optional filters
 */
export async function findByCompany(
  company: string,
  options?: FindReflectionsOptions
): Promise<DbReflection[]> {
  try {
    let sql = `
      SELECT * FROM reflections
      WHERE company = $1
    `;
    const params: (string | number)[] = [company];
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
    console.error('[DB:Reflections] FindByCompany error:', err);
    return [];
  }
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
  company: string,
  project: string,
  userId: string
): Promise<number> {
  try {
    const result = await query(
      'DELETE FROM reflections WHERE company = $1 AND project = $2 AND user_id = $3',
      [company, project, userId]
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
 * Count reflections by company
 */
export async function countByCompany(company: string): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) FROM reflections WHERE company = $1',
      [company]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (err) {
    console.error('[DB:Reflections] CountByCompany error:', err);
    return 0;
  }
}

/**
 * Get patterns (success reflections) for a company
 */
export async function getPatterns(
  company: string,
  options?: Omit<FindReflectionsOptions, 'feeling'>
): Promise<DbReflection[]> {
  return findByCompany(company, { ...options, feeling: 'success' });
}

/**
 * Get antipatterns (stuck reflections) for a company
 */
export async function getAntipatterns(
  company: string,
  options?: Omit<FindReflectionsOptions, 'feeling'>
): Promise<DbReflection[]> {
  return findByCompany(company, { ...options, feeling: 'stuck' });
}
