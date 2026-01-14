/**
 * CEDA JWT Configuration
 * CEDA-70.1: JWT Infrastructure
 *
 * Handles JWT secret management and token configuration.
 * In production, secrets should come from environment variables or secret management.
 */

import * as crypto from 'crypto';

/**
 * JWT Configuration
 */
export interface JwtConfig {
  /** Secret for signing access tokens */
  accessSecret: string;
  /** Secret for signing refresh tokens */
  refreshSecret: string;
  /** Access token expiration (default: 1 hour) */
  accessExpiresIn: string;
  /** Refresh token expiration (default: 7 days) */
  refreshExpiresIn: string;
  /** Token issuer */
  issuer: string;
  /** Token audience */
  audience: string;
}

/**
 * Load JWT configuration from environment
 * Falls back to generated secrets for development (with warning)
 */
export function loadJwtConfig(): JwtConfig {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    console.warn('[CEDA-AUTH] WARNING: JWT secrets not configured in environment.');
    console.warn('[CEDA-AUTH] Using generated secrets. DO NOT USE IN PRODUCTION.');
    console.warn('[CEDA-AUTH] Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables.');
  }

  return {
    accessSecret: accessSecret || generateDevSecret('access'),
    refreshSecret: refreshSecret || generateDevSecret('refresh'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'ceda.getceda.com',
    audience: process.env.JWT_AUDIENCE || 'ceda-api',
  };
}

/**
 * Generate a development secret (deterministic per type for dev convenience)
 * WARNING: Do not use in production
 */
function generateDevSecret(type: string): string {
  // Use a hash of type + static string for deterministic dev secrets
  // This means dev environments get same secret across restarts
  const devSeed = `ceda-dev-${type}-secret-DO-NOT-USE-IN-PRODUCTION`;
  return crypto.createHash('sha256').update(devSeed).digest('hex');
}

/**
 * Validate JWT configuration
 * Returns errors if configuration is invalid
 */
export function validateJwtConfig(config: JwtConfig): string[] {
  const errors: string[] = [];

  if (!config.accessSecret || config.accessSecret.length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  if (!config.refreshSecret || config.refreshSecret.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
  }

  if (config.accessSecret === config.refreshSecret) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  // Check for production environment with dev secrets
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_ACCESS_SECRET) {
      errors.push('JWT_ACCESS_SECRET must be set in production');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      errors.push('JWT_REFRESH_SECRET must be set in production');
    }
  }

  return errors;
}

/**
 * Parse duration string to milliseconds
 * Supports: s (seconds), m (minutes), h (hours), d (days)
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like "1h", "30m", "7d"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Parse duration string to seconds (for JWT exp claim)
 */
export function parseDurationSeconds(duration: string): number {
  return Math.floor(parseDuration(duration) / 1000);
}

// Singleton config instance
let configInstance: JwtConfig | null = null;

/**
 * Get JWT configuration (singleton)
 */
export function getJwtConfig(): JwtConfig {
  if (!configInstance) {
    configInstance = loadJwtConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetJwtConfig(): void {
  configInstance = null;
}
