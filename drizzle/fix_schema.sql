-- CEDA: Fix schema - manual cleanup before Drizzle push
-- Run via: railway run psql $DATABASE_URL -f drizzle/fix_schema.sql

BEGIN;

-- Drop columns from users that have no constraint
ALTER TABLE users DROP COLUMN IF EXISTS company_id CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS access_token_encrypted CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS roles CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS is_active CASCADE;

-- Drop old tables
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

COMMIT;

SELECT 'Schema cleaned - ready for drizzle-kit push' as status;
