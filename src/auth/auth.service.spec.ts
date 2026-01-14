/**
 * CEDA Auth Service Tests
 * CEDA-70.1: JWT Infrastructure
 */

import { AuthService } from './auth.service';
import { UserRecord, UserRole } from './auth.interface';
import { resetJwtConfig } from './jwt.config';

describe('AuthService', () => {
  let authService: AuthService;

  const mockUser: UserRecord = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: '',
    company: 'acme',
    roles: [UserRole.CONTRIBUTOR],
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
  });

  afterEach(() => {
    resetJwtConfig();
  });

  describe('Token Generation', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = authService.generateTokenPair(mockUser);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });

    it('should include project in token if provided', () => {
      const tokens = authService.generateTokenPair(mockUser, 'project-alpha');
      const payload = authService.verifyAccessToken(tokens.accessToken);

      expect(payload?.project).toBe('project-alpha');
    });
  });

  describe('Token Verification', () => {
    it('should verify valid access token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const payload = authService.verifyAccessToken(tokens.accessToken);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(mockUser.id);
      expect(payload?.email).toBe(mockUser.email);
      expect(payload?.company).toBe(mockUser.company);
      expect(payload?.roles).toEqual(mockUser.roles);
      expect(payload?.type).toBe('access');
    });

    it('should verify valid refresh token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const payload = authService.verifyRefreshToken(tokens.refreshToken);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(mockUser.id);
      expect(payload?.type).toBe('refresh');
    });

    it('should reject access token as refresh token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const payload = authService.verifyRefreshToken(tokens.accessToken);

      expect(payload).toBeNull();
    });

    it('should reject refresh token as access token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const payload = authService.verifyAccessToken(tokens.refreshToken);

      expect(payload).toBeNull();
    });

    it('should reject invalid token', () => {
      const payload = authService.verifyAccessToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should reject tampered token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const tamperedToken = tokens.accessToken.slice(0, -5) + 'xxxxx';
      const payload = authService.verifyAccessToken(tamperedToken);

      expect(payload).toBeNull();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'SecurePassword123!';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('API Key Generation', () => {
    it('should generate API key with company prefix', () => {
      const apiKey = authService.generateApiKey('acme');

      expect(apiKey).toMatch(/^ceda_acme_[a-f0-9]{48}$/);
    });

    it('should sanitize company prefix', () => {
      const apiKey = authService.generateApiKey('Acme Corp!');
      // Removes non-alphanumeric, lowercases, truncates to 8 chars: "Acme Corp!" -> "acmecor"
      expect(apiKey).toMatch(/^ceda_acmecor_[a-f0-9]{48}$/);
    });

    it('should truncate long company prefix', () => {
      const apiKey = authService.generateApiKey('verylongcompanyname');

      expect(apiKey).toMatch(/^ceda_verylong_[a-f0-9]{48}$/);
    });

    it('should hash API key deterministically', () => {
      const apiKey = 'ceda_test_abc123';
      const hash1 = authService.hashApiKey(apiKey);
      const hash2 = authService.hashApiKey(apiKey);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should extract key prefix', () => {
      const apiKey = 'ceda_acme_abcdef123456789012345678901234567890';
      const prefix = authService.getApiKeyPrefix(apiKey);

      expect(prefix).toBe('ceda_acme_abcdef');
    });
  });

  describe('Role Checking', () => {
    it('should allow matching role', () => {
      const context = authService.payloadToAuthContext({
        sub: 'user-1',
        email: 'test@example.com',
        company: 'acme',
        roles: [UserRole.CONTRIBUTOR],
        type: 'access',
      });

      expect(authService.hasRole(context, UserRole.CONTRIBUTOR)).toBe(true);
    });

    it('should allow reader access for contributor', () => {
      const context = authService.payloadToAuthContext({
        sub: 'user-1',
        email: 'test@example.com',
        company: 'acme',
        roles: [UserRole.CONTRIBUTOR],
        type: 'access',
      });

      expect(authService.hasRole(context, UserRole.READER)).toBe(true);
    });

    it('should allow all roles for admin', () => {
      const context = authService.payloadToAuthContext({
        sub: 'user-1',
        email: 'test@example.com',
        company: 'acme',
        roles: [UserRole.ADMIN],
        type: 'access',
      });

      expect(authService.hasRole(context, UserRole.READER)).toBe(true);
      expect(authService.hasRole(context, UserRole.CONTRIBUTOR)).toBe(true);
      expect(authService.hasRole(context, UserRole.ADMIN)).toBe(true);
      expect(authService.hasRole(context, UserRole.SUPER_ADMIN)).toBe(false);
    });

    it('should allow all roles for super admin', () => {
      const context = authService.payloadToAuthContext({
        sub: 'user-1',
        email: 'test@example.com',
        company: 'acme',
        roles: [UserRole.SUPER_ADMIN],
        type: 'access',
      });

      expect(authService.hasRole(context, UserRole.READER)).toBe(true);
      expect(authService.hasRole(context, UserRole.CONTRIBUTOR)).toBe(true);
      expect(authService.hasRole(context, UserRole.ADMIN)).toBe(true);
      expect(authService.hasRole(context, UserRole.SUPER_ADMIN)).toBe(true);
    });

    it('should check any role', () => {
      const context = authService.payloadToAuthContext({
        sub: 'user-1',
        email: 'test@example.com',
        company: 'acme',
        roles: [UserRole.READER],
        type: 'access',
      });

      expect(authService.hasAnyRole(context, [UserRole.ADMIN, UserRole.READER])).toBe(true);
      expect(authService.hasAnyRole(context, [UserRole.ADMIN, UserRole.CONTRIBUTOR])).toBe(false);
    });
  });

  describe('Token Utilities', () => {
    it('should decode token without verification', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const decoded = authService.decodeToken(tokens.accessToken);

      expect(decoded?.sub).toBe(mockUser.id);
    });

    it('should check token expiration', () => {
      const tokens = authService.generateTokenPair(mockUser);

      expect(authService.isTokenExpired(tokens.accessToken)).toBe(false);
    });

    it('should get token TTL', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const ttl = authService.getTokenTTL(tokens.accessToken);

      // Should be close to 1 hour (3600 seconds)
      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
  });
});
