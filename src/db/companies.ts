/**
 * CEDA Companies Repository
 *
 * Companies are tenants in the multi-tenant model.
 * Each user belongs to a company, subscriptions are per-company.
 */

import { query, transaction } from './index';

/**
 * Company record as stored in the database
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
 * Find company by ID
 */
export async function findById(id: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM companies WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find company by slug
 */
export async function findBySlug(slug: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM companies WHERE slug = $1',
    [slug]
  );
  return result.rows[0] || null;
}

/**
 * Find company by Stripe customer ID
 */
export async function findByStripeCustomerId(customerId: string): Promise<DbCompany | null> {
  const result = await query<DbCompany>(
    'SELECT * FROM companies WHERE stripe_customer_id = $1',
    [customerId]
  );
  return result.rows[0] || null;
}

/**
 * Create or get company by slug
 * Used during OAuth when user's org becomes a company
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
    `INSERT INTO companies (name, slug)
     VALUES ($1, $2)
     RETURNING *`,
    [name || slug, slug]
  );

  console.log(`[DB:Companies] Created company: ${slug}`);
  return { company: result.rows[0], isNew: true };
}

/**
 * Update Stripe customer ID for company
 */
export async function setStripeCustomerId(
  companyId: string,
  stripeCustomerId: string
): Promise<void> {
  await query(
    `UPDATE companies SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
    [stripeCustomerId, companyId]
  );
}

/**
 * Update company name
 */
export async function updateName(companyId: string, name: string): Promise<void> {
  await query(
    `UPDATE companies SET name = $1, updated_at = NOW() WHERE id = $2`,
    [name, companyId]
  );
}

/**
 * List all companies
 */
export async function listAll(limit: number = 100): Promise<DbCompany[]> {
  const result = await query<DbCompany>(
    'SELECT * FROM companies ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Count total companies
 */
export async function count(): Promise<number> {
  const result = await query<{ count: string }>('SELECT COUNT(*) FROM companies');
  return parseInt(result.rows[0].count, 10);
}
