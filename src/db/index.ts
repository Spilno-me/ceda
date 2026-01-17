/**
 * CEDA Database Layer
 *
 * PlanetScale PostgreSQL connection pool and utilities.
 * All database operations go through this layer.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Connection pool singleton
let pool: Pool | null = null;

/**
 * Get or create the database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn('[DB] DATABASE_URL not set - database features disabled');
      // Return a dummy pool that throws on use
      pool = new Pool({ connectionString: 'postgresql://localhost/dummy' });
      pool.on('error', () => {}); // Suppress errors for dummy pool
    } else {
      pool = new Pool({
        connectionString,
        max: 10, // Max connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false }, // PlanetScale requires SSL
      });

      pool.on('error', (err) => {
        console.error('[DB] Unexpected pool error:', err);
      });

      console.log('[DB] Connection pool initialized');
    }
  }
  return pool;
}

/**
 * Execute a query with automatic connection handling
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  } catch (err) {
    console.error('[DB] Query error:', err);
    throw err;
  }
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check database connectivity
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Gracefully close the pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}

// Export types for use in repositories
export type { Pool, PoolClient, QueryResult };
