-- CEDA: Migrate company → org (Git-native naming)
-- Run this BEFORE drizzle-kit push

-- Step 1: Create new orgs table from companies
INSERT INTO orgs (id, name, slug, stripe_customer_id, created_at, updated_at)
SELECT
  id,
  name,
  slug,
  stripe_customer_id,
  created_at,
  updated_at
FROM companies
ON CONFLICT (slug) DO NOTHING;

-- Step 2: Create user_orgs from user_organizations
INSERT INTO user_orgs (id, user_id, org_id, role, created_at)
SELECT
  id,
  user_id,
  organization_id,  -- maps to org_id
  role,
  created_at
FROM user_organizations
ON CONFLICT DO NOTHING;

-- Step 3: Update users table - migrate company_id to primary_org_id
UPDATE users
SET primary_org_id = company_id
WHERE company_id IS NOT NULL;

-- Step 4: Migrate access_token_encrypted to access_token_enc
UPDATE users
SET access_token_enc = access_token_encrypted
WHERE access_token_encrypted IS NOT NULL;

-- Verify migration
SELECT 'orgs' as table_name, COUNT(*) as count FROM orgs
UNION ALL
SELECT 'user_orgs', COUNT(*) FROM user_orgs
UNION ALL
SELECT 'users with primary_org', COUNT(*) FROM users WHERE primary_org_id IS NOT NULL;
