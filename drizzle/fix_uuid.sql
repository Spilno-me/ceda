-- CEDA: Fix UUID type casting
-- Check current column types first

-- See what we're dealing with
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'id'
ORDER BY table_name;
