-- PlanetScale Schema: User Preferences
-- CEDA-42 - Jan 2026

-- Add preferences JSON column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSON DEFAULT '{}';

-- Add index for faster preference lookups (optional, for future queries)
-- Note: JSON columns can't be directly indexed in MySQL, but we can add
-- generated columns for specific preference fields if needed later
