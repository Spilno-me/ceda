/**
 * CEDA Drizzle Client
 *
 * Database connection using Drizzle ORM + PostgreSQL
 * Git-native model: user → project → org → orgs → global
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[DB] DATABASE_URL not set - database features disabled');
}

// PostgreSQL client
const client = connectionString
  ? postgres(connectionString, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    })
  : null;

// Drizzle ORM instance with schema
export const db = client
  ? drizzle(client, { schema })
  : null;

// Export schema for type inference
export { schema };

// Health check
export async function healthCheck(): Promise<boolean> {
  if (!db) return false;
  try {
    await db.execute`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.end();
    console.log('[DB] Connection closed');
  }
}

/**
 * Type-safe query helpers
 */
export type Database = typeof db;
export type Schema = typeof schema;
