-- PostgreSQL Schema: Observations and Reflections for Pattern Learning
-- CEDA-42 - Jan 2026
-- Converted from MySQL, company → org (Git-native model)

-- Reflections table - stores Herald reflections (patterns/antipatterns)
CREATE TABLE IF NOT EXISTS reflections (
    id VARCHAR(255) PRIMARY KEY,
    session VARCHAR(1024) NOT NULL,
    feeling VARCHAR(50) NOT NULL,
    insight TEXT NOT NULL,
    method VARCHAR(50) DEFAULT 'direct',
    signal TEXT,
    outcome VARCHAR(50),
    reinforcement TEXT,
    warning TEXT,
    org VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255) NOT NULL DEFAULT 'default',
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    vault VARCHAR(255),
    level INT DEFAULT 0,
    helpful_count INT DEFAULT 0,
    unhelpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reflections_org ON reflections(org);
CREATE INDEX IF NOT EXISTS idx_reflections_project ON reflections(org, project);
CREATE INDEX IF NOT EXISTS idx_reflections_user ON reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_reflections_feeling ON reflections(feeling);
CREATE INDEX IF NOT EXISTS idx_reflections_created ON reflections(created_at);
CREATE INDEX IF NOT EXISTS idx_reflections_level ON reflections(level);
CREATE INDEX IF NOT EXISTS idx_reflections_level_org ON reflections(level, org);

-- Observations table - stores learning observations from predictions
CREATE TABLE IF NOT EXISTS observations (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    pattern_id VARCHAR(255),
    outcome VARCHAR(50) NOT NULL,
    prediction JSONB,
    modifications JSONB,
    feedback TEXT,
    confidence DECIMAL(5,4),
    timing_ms INT,
    org VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255) NOT NULL DEFAULT 'default',
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_observations_pattern ON observations(pattern_id);
CREATE INDEX IF NOT EXISTS idx_observations_outcome ON observations(outcome);
CREATE INDEX IF NOT EXISTS idx_observations_org ON observations(org);
CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at);

-- Learned patterns table - patterns created from clustered observations
CREATE TABLE IF NOT EXISTS learned_patterns (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    structure JSONB NOT NULL,
    source_observations JSONB,
    level VARCHAR(50) DEFAULT 'user',
    quality_score DECIMAL(5,2) DEFAULT 50.00,
    usage_count INT DEFAULT 0,
    acceptance_rate DECIMAL(5,4) DEFAULT 0.0,
    org VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255),
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_level ON learned_patterns(level);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_org ON learned_patterns(org);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_quality ON learned_patterns(quality_score);

-- Insights table - cross-context insights shared between sessions
CREATE TABLE IF NOT EXISTS insights (
    id VARCHAR(255) PRIMARY KEY,
    from_context VARCHAR(255) NOT NULL,
    to_context VARCHAR(255) NOT NULL,
    topic VARCHAR(255),
    insight TEXT NOT NULL,
    org VARCHAR(255) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_insights_to_context ON insights(to_context);
CREATE INDEX IF NOT EXISTS idx_insights_topic ON insights(topic);
CREATE INDEX IF NOT EXISTS idx_insights_org ON insights(org);

-- Pattern applications table - tracks when patterns are applied and if they helped
CREATE TABLE IF NOT EXISTS pattern_applications (
    id SERIAL PRIMARY KEY,
    reflection_id VARCHAR(255) NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    helped BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pattern_applications_reflection ON pattern_applications(reflection_id);
