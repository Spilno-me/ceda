-- PlanetScale Schema: Observations and Reflections for Pattern Learning
-- CEDA-42 - Jan 2026

-- Reflections table - stores Herald reflections (patterns/antipatterns)
CREATE TABLE IF NOT EXISTS reflections (
    id VARCHAR(255) PRIMARY KEY,              -- UUID
    session VARCHAR(1024) NOT NULL,           -- Session context (sanitized)
    feeling VARCHAR(50) NOT NULL,             -- 'stuck' or 'success'
    insight TEXT NOT NULL,                    -- The captured insight
    method VARCHAR(50) DEFAULT 'direct',      -- 'direct' or 'simulation'
    signal TEXT,                              -- AI-extracted signal
    outcome VARCHAR(50),                      -- 'pattern' or 'antipattern'
    reinforcement TEXT,                       -- What to reinforce
    warning TEXT,                             -- Warning for antipatterns
    company VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255) NOT NULL DEFAULT 'default',
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    vault VARCHAR(255),                       -- Optional vault identifier
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_company (company),
    INDEX idx_project (company, project),
    INDEX idx_user (user_id),
    INDEX idx_feeling (feeling),
    INDEX idx_created (created_at)
);

-- Observations table - stores learning observations from predictions
CREATE TABLE IF NOT EXISTS observations (
    id VARCHAR(255) PRIMARY KEY,              -- UUID
    session_id VARCHAR(255) NOT NULL,         -- Session reference
    pattern_id VARCHAR(255),                  -- Pattern that was matched
    outcome VARCHAR(50) NOT NULL,             -- 'accepted', 'modified', 'rejected'
    prediction JSON,                          -- The prediction that was made
    modifications JSON,                       -- Any modifications made
    feedback TEXT,                            -- User feedback
    confidence DECIMAL(5,4),                  -- Confidence score (0-1)
    timing_ms INT,                            -- How long prediction took
    company VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255) NOT NULL DEFAULT 'default',
    user_id VARCHAR(255) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_session (session_id),
    INDEX idx_pattern (pattern_id),
    INDEX idx_outcome (outcome),
    INDEX idx_company_obs (company),
    INDEX idx_created_obs (created_at)
);

-- Learned patterns table - patterns created from clustered observations
CREATE TABLE IF NOT EXISTS learned_patterns (
    id VARCHAR(255) PRIMARY KEY,              -- UUID
    name VARCHAR(255) NOT NULL,
    description TEXT,
    structure JSON NOT NULL,                  -- Pattern structure
    source_observations JSON,                 -- IDs of observations that created this
    level VARCHAR(50) DEFAULT 'user',         -- 'user', 'project', 'company', 'global'
    quality_score DECIMAL(5,2) DEFAULT 50.00,
    usage_count INT DEFAULT 0,
    acceptance_rate DECIMAL(5,4) DEFAULT 0.0,
    company VARCHAR(255) NOT NULL DEFAULT 'default',
    project VARCHAR(255),
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_level (level),
    INDEX idx_company_lp (company),
    INDEX idx_quality (quality_score)
);

-- Insights table - cross-context insights shared between sessions
CREATE TABLE IF NOT EXISTS insights (
    id VARCHAR(255) PRIMARY KEY,              -- UUID
    from_context VARCHAR(255) NOT NULL,
    to_context VARCHAR(255) NOT NULL,
    topic VARCHAR(255),
    insight TEXT NOT NULL,
    company VARCHAR(255) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_to_context (to_context),
    INDEX idx_topic (topic),
    INDEX idx_company_ins (company)
);

-- Pattern applications table - tracks when patterns are applied and if they helped
CREATE TABLE IF NOT EXISTS pattern_applications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reflection_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    helped BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_reflection (reflection_id),
    FOREIGN KEY (reflection_id) REFERENCES reflections(id) ON DELETE CASCADE
);
