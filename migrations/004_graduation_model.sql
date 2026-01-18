-- PlanetScale Schema: Graduation Model
-- CEDA-95 - Jan 2026

-- Add level column to reflections table for 6-level graduation model
-- Level 0: Observation (raw herald_reflect capture)
-- Level 1: User Pattern (3+ obs, 70% helpful, same user)
-- Level 2: Project Pattern (3+ users, 80% helpful, same project)
-- Level 3: Org Pattern (3+ projects, 85% helpful, same org)
-- Level 4: Cross-Org (explicit share, 90% helpful)
-- Level 5: Global (admin approved, 95% helpful)

ALTER TABLE reflections ADD COLUMN IF NOT EXISTS level INT DEFAULT 0;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0;
ALTER TABLE reflections ADD COLUMN IF NOT EXISTS unhelpful_count INT DEFAULT 0;

-- Add index for level queries (efficient filtering by graduation level)
CREATE INDEX IF NOT EXISTS idx_reflections_level ON reflections(level);

-- Add composite index for level + company queries (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_reflections_level_company ON reflections(level, company);
