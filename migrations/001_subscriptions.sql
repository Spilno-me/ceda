-- PlanetScale Schema: Subscriptions for Stripe billing
-- CEDA MVP - Jan 2026

-- Subscriptions table
CREATE TABLE subscriptions (
    id VARCHAR(255) PRIMARY KEY,           -- Stripe subscription ID (sub_xxx)
    customer_id VARCHAR(255) NOT NULL,     -- Stripe customer ID (cus_xxx)
    company VARCHAR(255) NOT NULL,         -- CEDA company identifier
    status VARCHAR(50) NOT NULL,           -- active, canceled, past_due, etc.
    plan VARCHAR(50) NOT NULL,             -- free, pro, enterprise
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    canceled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_customer (customer_id),
    INDEX idx_company (company),
    INDEX idx_status (status)
);

-- Usage tracking (for metered billing later)
CREATE TABLE usage_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    company VARCHAR(255) NOT NULL,
    metric VARCHAR(100) NOT NULL,          -- predictions, reflections, etc.
    count INT NOT NULL DEFAULT 1,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_company_metric (company, metric),
    INDEX idx_recorded (recorded_at)
);

-- Webhook events log (idempotency)
CREATE TABLE stripe_events (
    id VARCHAR(255) PRIMARY KEY,           -- Stripe event ID (evt_xxx)
    type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_type (type)
);
