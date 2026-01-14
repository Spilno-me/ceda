/**
 * CEDA JWT Guard
 * CEDA-70.2: JWT Guard
 *
 * Validates Bearer tokens in Authorization header.
 * Extracts user context and injects into request.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { AuthService } from './auth.service';
import { AuthContext, JwtPayload } from './auth.interface';

/**
 * Extended request with auth context
 */
export interface AuthenticatedRequest extends IncomingMessage {
  auth?: AuthContext;
}

/**
 * Error response for authentication failures
 */
export interface AuthError {
  statusCode: number;
  error: string;
  message: string;
}

/**
 * Guard result
 */
export interface GuardResult {
  authenticated: boolean;
  context?: AuthContext;
  error?: AuthError;
}

/**
 * JWT Guard
 * Validates Bearer tokens and extracts auth context
 */
export class JwtGuard {
  private authService: AuthService;

  constructor(authService?: AuthService) {
    this.authService = authService || new AuthService();
  }

  /**
   * Validate request and extract auth context
   */
  validate(req: IncomingMessage): GuardResult {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing Authorization header',
        },
      };
    }

    // Check Bearer scheme
    if (!authHeader.startsWith('Bearer ')) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid authorization scheme. Use Bearer token.',
        },
      };
    }

    // Extract token
    const token = authHeader.substring(7);

    if (!token) {
      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing token',
        },
      };
    }

    // Verify token
    const payload = this.authService.verifyAccessToken(token);

    if (!payload) {
      // Check if token is just expired vs invalid
      if (this.authService.isTokenExpired(token)) {
        return {
          authenticated: false,
          error: {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Token expired',
          },
        };
      }

      return {
        authenticated: false,
        error: {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      };
    }

    // Extract context
    const context = this.authService.payloadToAuthContext(payload, 'jwt');

    return {
      authenticated: true,
      context,
    };
  }

  /**
   * Middleware-style guard for use in request handler
   * Returns true if authenticated, sends error response if not
   */
  async guard(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    const result = this.validate(req);

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
   * Usage: if (!await jwtGuard.protect(req, res)) return;
   */
  protect(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    return this.guard(req, res);
  }
}

/**
 * Optional JWT Guard
 * Does not require authentication but extracts context if present
 */
export class OptionalJwtGuard {
  private jwtGuard: JwtGuard;

  constructor(authService?: AuthService) {
    this.jwtGuard = new JwtGuard(authService);
  }

  /**
   * Try to extract auth context, but don't fail if not present
   */
  validate(req: IncomingMessage): GuardResult {
    const authHeader = req.headers.authorization;

    // No auth header = no context, but not an error
    if (!authHeader) {
      return { authenticated: false };
    }

    // If header present, validate it
    return this.jwtGuard.validate(req);
  }

  /**
   * Middleware-style - always passes, but extracts context if available
   */
  async guard(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
    const result = this.validate(req);

    // If token was provided and is invalid, still fail
    if (req.headers.authorization && !result.authenticated && result.error) {
      res.writeHead(result.error.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error));
      return false;
    }

    // Inject context if available
    if (result.context) {
      req.auth = result.context;
    }

    return true;
  }
}

/**
 * Utility to extract Bearer token from request
 */
export function extractBearerToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7) || null;
}

/**
 * Utility to check if request is authenticated
 */
export function isAuthenticated(req: AuthenticatedRequest): boolean {
  return !!req.auth;
}

/**
 * Utility to get auth context from request
 * Throws if not authenticated
 */
export function getAuthContext(req: AuthenticatedRequest): AuthContext {
  if (!req.auth) {
    throw new Error('Request is not authenticated');
  }
  return req.auth;
}
