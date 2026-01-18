-- CEDA: Complete company → org migration
-- Run this manually, then drizzle-kit push will see no data loss

BEGIN;

-- ============================================
-- STEP 1: Create new tables if they don't exist
-- ============================================

-- Create orgs table
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_orgs junction table
CREATE TABLE IF NOT EXISTS user_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STEP 2: Migrate data from old tables
-- ============================================

-- Migrate companies → orgs
INSERT INTO orgs (id, name, slug, stripe_customer_id, created_at, updated_at)
SELECT id, name, slug, stripe_customer_id, created_at, updated_at
FROM companies
ON CONFLICT (slug) DO NOTHING;

-- Migrate user_organizations → user_orgs
INSERT INTO user_orgs (id, user_id, org_id, role, created_at)
SELECT id, user_id, organization_id, role, created_at
FROM user_organizations
ON CONFLICT DO NOTHING;

-- ============================================
-- STEP 3: Add new columns to users if needed
-- ============================================

-- Add primary_org_id if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_org_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token_enc TEXT;

-- Migrate data
UPDATE users SET primary_org_id = company_id WHERE company_id IS NOT NULL AND primary_org_id IS NULL;
UPDATE users SET access_token_enc = access_token_encrypted WHERE access_token_encrypted IS NOT NULL AND access_token_enc IS NULL;

-- ============================================
-- STEP 4: Drop old tables and columns
-- ============================================

-- Drop old junction table
DROP TABLE IF EXISTS user_organizations;

-- Drop old company table
DROP TABLE IF EXISTS companies;

-- Drop old columns from users
ALTER TABLE users DROP COLUMN IF EXISTS company_id;
ALTER TABLE users DROP COLUMN IF EXISTS access_token_encrypted;
ALTER TABLE users DROP COLUMN IF EXISTS roles;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;

-- ============================================
-- STEP 5: Add foreign keys and indexes
-- ============================================

-- Foreign keys for user_orgs
ALTER TABLE user_orgs
  ADD CONSTRAINT IF NOT EXISTS user_orgs_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_orgs
  ADD CONSTRAINT IF NOT EXISTS user_orgs_org_id_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;

-- Foreign key for users.primary_org_id
ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS users_primary_org_id_fk
  FOREIGN KEY (primary_org_id) REFERENCES orgs(id);

COMMIT;

-- Verify
SELECT 'Migration complete' as status;
SELECT 'orgs' as table_name, COUNT(*) as count FROM orgs
UNION ALL
SELECT 'user_orgs', COUNT(*) FROM user_orgs;
