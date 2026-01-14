/**
 * CEDA API Key Guard
 * CEDA-70.5: API Key Guard
 *
 * Validates X-API-Key header for programmatic API access.
 * Uses API Key Service for key lookup (implemented by Devin in CEDA-70.4).
 */

import { IncomingMessage, ServerResponse } from 'http';
import { AuthService } from './auth.service';
import { AuthContext, ApiKeyRecord, UserRole } from './auth.interface';
import { AuthenticatedRequest, GuardResult, AuthError } from './jwt.guard';

/**
 * API Key lookup interface
 * Implemented by ApiKeyService (CEDA-70.4)
 */
export interface ApiKeyLookup {
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  touchKey(keyId: string): Promise<void>;
}

/**
 * In-memory API key store for development/testing
 * Replace with ApiKeyService in production
 */
export class InMemoryApiKeyStore implements ApiKeyLookup {
  private keys: Map<string, ApiKeyRecord> = new Map();

  addKey(keyHash: string, record: ApiKeyRecord): void {
    this.keys.set(keyHash, record);
  }

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.keys.get(keyHash) || null;
  }

  async touchKey(keyId: string): Promise<void> {
    // Find and update last_used
    for (const record of this.keys.values()) {
      if (record.id === keyId) {
        record.lastUsedAt = new Date().toISOString();
        break;
      }
    }
  }

  clear(): void {
    this.keys.clear();
  }
}

/**
 * API Key Guard
 * Validates X-API-Key header and extracts auth context
 */
export class ApiKeyGuard {
  private authService: AuthService;
  private keyLookup: ApiKeyLookup;

  constructor(keyLookup: ApiKeyLookup, authService?: AuthService) {
    this.keyLookup = keyLookup;
    this.authService = authService || new AuthService();
  }

  /**
   * Validate request and extract auth context
   */
  async validate(req: IncomingMessage): Promise<GuardResult> {
    // Extract X-API-Key header
    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing X-API-Key header',
        },
      };
    }

    // Validate key format
    if (!this.isValidKeyFormat(apiKey)) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid API key format',
        },
      };
    }

    // Hash key and lookup
    const keyHash = this.authService.hashApiKey(apiKey);
    const keyRecord = await this.keyLookup.findByHash(keyHash);

    if (!keyRecord) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid API key',
        },
      };
    }

    // Check if key is active
    if (!keyRecord.isActive) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'API key has been revoked',
        },
      };
    }

    // Check expiration
    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'API key has expired',
        },
      };
    }

    // Update last used timestamp (async, non-blocking)
    this.keyLookup.touchKey(keyRecord.id).catch(() => {
      // Ignore touch errors - non-critical
    });

    // Build auth context
    const context: AuthContext = {
      userId: keyRecord.userId,
      email: '', // API keys don't have email
      company: keyRecord.company,
      project: keyRecord.project,
      roles: keyRecord.roles,
      authMethod: 'api_key',
    };

    return {
      authenticated: true,
      context,
    };
  }

  /**
   * Extract API key from request
   * Checks X-API-Key header and x-api-key (case insensitive)
   */
  private extractApiKey(req: IncomingMessage): string | null {
    // Try X-API-Key (canonical)
    const apiKey = req.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      return apiKey;
    }

    // Try lowercase
    const apiKeyLower = req.headers['x-api-key'];
    if (apiKeyLower && typeof apiKeyLower === 'string') {
      return apiKeyLower;
    }

    return null;
  }

  /**
   * Validate API key format
   * Expected format: ceda_[prefix]_[random]
   */
  private isValidKeyFormat(apiKey: string): boolean {
    return /^ceda_[a-z0-9]{1,8}_[a-f0-9]{48}$/.test(apiKey);
  }

  /**
   * Middleware-style guard for use in request handler
   * Returns true if authenticated, sends error response if not
   */
  async guard(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    const result = await this.validate(req);

    if (!result.authenticated) {
      res.writeHead(result.error!.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
      return false;
    }

    // Inject auth context into request
    req.auth = result.context;
    return true;
  }

  /**
   * Create guard function for endpoint protection
   * Usage: if (!await apiKeyGuard.protect(req, res)) return;
   */
  protect(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    return this.guard(req, res);
  }
}

/**
 * Combined Guard
 * Tries JWT first, falls back to API Key
 * Use for endpoints that accept both auth methods
 */
export class CombinedAuthGuard {
  private jwtGuard: { validate: (req: IncomingMessage) => GuardResult };
  private apiKeyGuard: ApiKeyGuard;

  constructor(
    jwtGuard: { validate: (req: IncomingMessage) => GuardResult },
    apiKeyGuard: ApiKeyGuard,
  ) {
    this.jwtGuard = jwtGuard;
    this.apiKeyGuard = apiKeyGuard;
  }

  /**
   * Try JWT auth first, then API key
   */
  async validate(req: IncomingMessage): Promise<GuardResult> {
    // Check for Authorization header (JWT)
    if (req.headers.authorization) {
      const jwtResult = this.jwtGuard.validate(req);
      if (jwtResult.authenticated) {
        return jwtResult;
      }
      // If JWT provided but invalid, return JWT error
      return jwtResult;
    }

    // Check for API key
    if (req.headers['x-api-key']) {
      return this.apiKeyGuard.validate(req);
    }

    // No auth provided
    return {
      authenticated: false,
      error: {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing authentication. Provide Authorization header or X-API-Key.',
      },
    };
  }

  /**
   * Middleware-style guard
   */
  async guard(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    const result = await this.validate(req);

    if (!result.authenticated) {
      res.writeHead(result.error!.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
      return false;
    }

    req.auth = result.context;
    return true;
  }

  protect(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    return this.guard(req, res);
  }
}

/**
 * Utility to extract API key from request
 */
export function extractApiKey(req: IncomingMessage): string | null {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && typeof apiKey === 'string') {
    return apiKey;
  }
  return null;
}
