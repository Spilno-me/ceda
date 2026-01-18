/**
 * CEDA Orgs Repository (formerly Companies)
 *
 * Orgs are tenants in the multi-tenant model.
 * Git-native naming: org = GitHub organization
 * Each user belongs to an org, subscriptions are per-org.
 */

import { query, transaction } from './index';

/**
 * Org record as stored in the database
 * @deprecated Use DbCompany for backwards compat, but table is now 'orgs'
 */
export interface DbCompany {
  id: string; // UUID
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find org by ID
 */
export async function findById(id: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM orgs WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find org by slug
 */
export async function findBySlug(slug: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM orgs WHERE slug = $1',
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Find org by Stripe customer ID
 */
export async function findByStripeCustomerId(customerId: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM orgs WHERE stripe_customer_id = $1',
    [customerId]
  );
  return result.rows[0] || null;
}

/**
 * Create or get org by slug
 * Used during OAuth when user's GitHub org becomes a CEDA org
 */
export async function upsertBySlug(
  slug: string,
  name?: string
): Promise<{ company: DbCompany; isNew: boolean }> {
  // Check if exists
  const existing = await findBySlug(slug);
  if (existing) {
    return { company: existing, isNew: false };
  }

  // Create new
  const result = await query<DbCompany>(
    `INSERT INTO orgs (name, slug)
     VALUES ($1, $2)
     RETURNING *`,
    [name || slug, slug]
  );

  console.log(`[DB:Orgs] Created org: ${slug}`);
  return { company: result.rows[0], isNew: true };
}

/**
 * Update Stripe customer ID for org
 */
export async function setStripeCustomerId(
  orgId: string,
  stripeCustomerId: string
): Promise<void> {
  await query(
    `UPDATE orgs SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
    [stripeCustomerId, orgId]
  );
}

/**
 * Update org name
 */
export async function updateName(orgId: string, name: string): Promise<void> {
  await query(
    `UPDATE orgs SET name = $1, updated_at = NOW() WHERE id = $2`,
    [name, orgId]
  );
}

/**
 * List all orgs
 */
export async function listAll(limit: number = 100): Promise<DbCompany[]> {
  const result = await query<DbCompany>(
    'SELECT * FROM orgs ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Count total orgs
 */
export async function count(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*) FROM orgs');
  return parseInt(result.rows[0].count, 10);
}
