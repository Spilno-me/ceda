/**
 * CEDA Authentication Service
 * CEDA-70.1: JWT Infrastructure
 * CEDA-70.3: Auth Service (Token generation, password hashing)
 *
 * Handles JWT token generation, validation, and password management.
 */

import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  JwtPayload,
  TokenPair,
  UserRecord,
  UserRole,
  AuthContext,
  LoginRequest,
  RefreshRequest,
} from './auth.interface';
import { getJwtConfig, parseDurationSeconds, JwtConfig } from './jwt.config';

/**
 * Authentication Service
 * Handles token generation, validation, and password management
 */
export class AuthService {
  private config: JwtConfig;
  private readonly BCRYPT_ROUNDS = 12;

  constructor() {
    this.config = getJwtConfig();
  }

  /**
   * Generate access and refresh token pair
   */
  generateTokenPair(user: UserRecord, project?: string): TokenPair {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      company: user.company,
      project,
      roles: user.roles,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      company: user.company,
      roles: user.roles,
      type: 'refresh',
    };

    const accessToken = jwt.sign(
      accessPayload,
      this.config.accessSecret,
      {
        expiresIn: this.config.accessExpiresIn as jwt.SignOptions['expiresIn'],
        issuer: this.config.issuer,
        audience: this.config.audience,
      }
    );

    const refreshToken = jwt.sign(
      refreshPayload,
      this.config.refreshSecret,
      {
        expiresIn: this.config.refreshExpiresIn as jwt.SignOptions['expiresIn'],
        issuer: this.config.issuer,
        audience: this.config.audience,
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationSeconds(this.config.accessExpiresIn),
      tokenType: 'Bearer',
    };
  }

  /**
   * Verify access token and extract payload
   */
  verifyAccessToken(token: string): JwtPayload | null {
    try {
      const payload = jwt.verify(token, this.config.accessSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JwtPayload;

      if (payload.type !== 'access') {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Verify refresh token and extract payload
   */
  verifyRefreshToken(token: string): JwtPayload | null {
    try {
      const payload = jwt.verify(token, this.config.refreshSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      }) as JwtPayload;

      if (payload.type !== 'refresh') {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Extract auth context from JWT payload
   */
  payloadToAuthContext(payload: JwtPayload, authMethod: 'jwt' | 'api_key' = 'jwt'): AuthContext {
    return {
      userId: payload.sub,
      email: payload.email,
      company: payload.company,
      project: payload.project,
      roles: payload.roles,
      authMethod,
    };
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate API key (32 bytes = 64 hex chars)
   * Format: ceda_[company_prefix]_[random]
   */
  generateApiKey(companyPrefix: string): string {
    const random = crypto.randomBytes(24).toString('hex');
    const prefix = companyPrefix.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `ceda_${prefix}_${random}`;
  }

  /**
   * Hash API key using SHA-256
   */
  hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Extract prefix from API key (for display)
   */
  getApiKeyPrefix(apiKey: string): string {
    return apiKey.substring(0, 16);
  }

  /**
   * Decode token without verification (for debugging)
   * WARNING: Do not use for authentication
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.decode(token) as JwtPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return decoded.exp * 1000 < Date.now();
  }

  /**
   * Get remaining time until token expires (in seconds)
   */
  getTokenTTL(token: string): number {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return 0;
    }
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, ttl);
  }

  /**
   * Check if user has required role
   */
  hasRole(context: AuthContext, requiredRole: UserRole): boolean {
    // Super admin has all roles
    if (context.roles.includes(UserRole.SUPER_ADMIN)) {
      return true;
    }

    // Admin has all roles except super_admin
    if (context.roles.includes(UserRole.ADMIN) && requiredRole !== UserRole.SUPER_ADMIN) {
      return true;
    }

    // Contributor has reader access
    if (context.roles.includes(UserRole.CONTRIBUTOR) && requiredRole === UserRole.READER) {
      return true;
    }

    return context.roles.includes(requiredRole);
  }

  /**
   * Check if user has any of the required roles
   */
  hasAnyRole(context: AuthContext, requiredRoles: UserRole[]): boolean {
    return requiredRoles.some(role => this.hasRole(context, role));
  }
}
