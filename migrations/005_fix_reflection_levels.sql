-- CEDA-102: Fix reflection levels for user-captured reflections
-- User reflections via herald_reflect are pre-validated (level 1), not raw observations (level 0)
-- This migration upgrades existing level 0 reflections captured via 'direct' or 'simulation' method

-- Update all existing user reflections to level 1
UPDATE reflections
SET level = 1, updated_at = CURRENT_TIMESTAMP
WHERE level = 0
  AND method IN ('direct', 'simulation');

-- Log the migration
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'CEDA-102: Updated % reflections from level 0 to level 1', updated_count;
END $$;
