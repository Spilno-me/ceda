/**
 * CEDA JWT Guard Tests
 * CEDA-70.2: JWT Guard
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { JwtGuard, OptionalJwtGuard, AuthenticatedRequest, extractBearerToken, isAuthenticated, getAuthContext } from './jwt.guard';
import { AuthService } from './auth.service';
import { UserRecord, UserRole } from './auth.interface';
import { resetJwtConfig } from './jwt.config';

describe('JwtGuard', () => {
  let jwtGuard: JwtGuard;
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

  function createMockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
    const socket = new Socket();
    const req = new IncomingMessage(socket) as AuthenticatedRequest;
    Object.assign(req.headers, headers);
    return req;
  }

  function createMockResponse(): ServerResponse {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    const res = new ServerResponse(req);

    // Mock write methods with any to avoid TypeScript overload issues
    (res as any).writeHead = jest.fn().mockReturnValue(res);
    (res as any).end = jest.fn().mockReturnValue(res);

    return res;
  }

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
    jwtGuard = new JwtGuard(authService);
  });

  afterEach(() => {
    resetJwtConfig();
  });

  describe('validate', () => {
    it('should reject request without Authorization header', () => {
      const req = createMockRequest();
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Missing Authorization header');
    });

    it('should reject non-Bearer authorization scheme', () => {
      const req = createMockRequest({ authorization: 'Basic abc123' });
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Invalid authorization scheme. Use Bearer token.');
    });

    it('should reject empty Bearer token', () => {
      const req = createMockRequest({ authorization: 'Bearer ' });
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Missing token');
    });

    it('should reject invalid token', () => {
      const req = createMockRequest({ authorization: 'Bearer invalid-token' });
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      // Invalid tokens that can't be decoded are reported as expired or invalid
      expect(['Invalid token', 'Token expired']).toContain(result.error?.message);
    });

    it('should accept valid token and extract context', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const req = createMockRequest({ authorization: `Bearer ${tokens.accessToken}` });
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.userId).toBe(mockUser.id);
      expect(result.context?.email).toBe(mockUser.email);
      expect(result.context?.company).toBe(mockUser.company);
      expect(result.context?.roles).toEqual(mockUser.roles);
      expect(result.context?.authMethod).toBe('jwt');
    });

    it('should reject refresh token as access token', () => {
      const tokens = authService.generateTokenPair(mockUser);
      const req = createMockRequest({ authorization: `Bearer ${tokens.refreshToken}` });
      const result = jwtGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
    });
  });

  describe('guard', () => {
    it('should send 401 response for unauthenticated request', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const passed = await jwtGuard.guard(req, res);

      expect(passed).toBe(false);
      expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
    });

    it('should pass and inject context for authenticated request', async () => {
      const tokens = authService.generateTokenPair(mockUser);
      const req = createMockRequest({ authorization: `Bearer ${tokens.accessToken}` });
      const res = createMockResponse();

      const passed = await jwtGuard.guard(req, res);

      expect(passed).toBe(true);
      expect(req.auth).toBeDefined();
      expect(req.auth?.userId).toBe(mockUser.id);
    });
  });
});

describe('OptionalJwtGuard', () => {
  let optionalGuard: OptionalJwtGuard;
  let authService: AuthService;

  const mockUser: UserRecord = {
    id: 'user-456',
    email: 'optional@example.com',
    passwordHash: '',
    company: 'beta',
    roles: [UserRole.READER],
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  function createMockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
    const socket = new Socket();
    const req = new IncomingMessage(socket) as AuthenticatedRequest;
    Object.assign(req.headers, headers);
    return req;
  }

  function createMockResponse(): ServerResponse {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    const res = new ServerResponse(req);
    res.writeHead = jest.fn(() => res);
    res.end = jest.fn(() => res);
    return res;
  }

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
    optionalGuard = new OptionalJwtGuard(authService);
  });

  afterEach(() => {
    resetJwtConfig();
  });

  it('should pass without auth header', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    const passed = await optionalGuard.guard(req, res);

    expect(passed).toBe(true);
    expect(req.auth).toBeUndefined();
  });

  it('should extract context when valid token provided', async () => {
    const tokens = authService.generateTokenPair(mockUser);
    const req = createMockRequest({ authorization: `Bearer ${tokens.accessToken}` });
    const res = createMockResponse();

    const passed = await optionalGuard.guard(req, res);

    expect(passed).toBe(true);
    expect(req.auth).toBeDefined();
    expect(req.auth?.userId).toBe(mockUser.id);
  });

  it('should fail when invalid token provided', async () => {
    const req = createMockRequest({ authorization: 'Bearer invalid-token' });
    const res = createMockResponse();

    const passed = await optionalGuard.guard(req, res);

    expect(passed).toBe(false);
  });
});

describe('Utilities', () => {
  let authService: AuthService;

  const mockUser: UserRecord = {
    id: 'user-789',
    email: 'util@example.com',
    passwordHash: '',
    company: 'gamma',
    roles: [UserRole.ADMIN],
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  function createMockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
    const socket = new Socket();
    const req = new IncomingMessage(socket) as AuthenticatedRequest;
    Object.assign(req.headers, headers);
    return req;
  }

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
  });

  afterEach(() => {
    resetJwtConfig();
  });

  describe('extractBearerToken', () => {
    it('should return null without auth header', () => {
      const req = createMockRequest();
      expect(extractBearerToken(req)).toBeNull();
    });

    it('should return null for non-Bearer scheme', () => {
      const req = createMockRequest({ authorization: 'Basic abc' });
      expect(extractBearerToken(req)).toBeNull();
    });

    it('should extract token', () => {
      const req = createMockRequest({ authorization: 'Bearer my-token' });
      expect(extractBearerToken(req)).toBe('my-token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false without auth context', () => {
      const req = createMockRequest();
      expect(isAuthenticated(req)).toBe(false);
    });

    it('should return true with auth context', () => {
      const req = createMockRequest();
      const tokens = authService.generateTokenPair(mockUser);
      req.auth = authService.payloadToAuthContext(
        authService.verifyAccessToken(tokens.accessToken)!,
        'jwt'
      );
      expect(isAuthenticated(req)).toBe(true);
    });
  });

  describe('getAuthContext', () => {
    it('should throw without auth context', () => {
      const req = createMockRequest();
      expect(() => getAuthContext(req)).toThrow('Request is not authenticated');
    });

    it('should return context when authenticated', () => {
      const req = createMockRequest();
      const tokens = authService.generateTokenPair(mockUser);
      req.auth = authService.payloadToAuthContext(
        authService.verifyAccessToken(tokens.accessToken)!,
        'jwt'
      );

      const context = getAuthContext(req);
      expect(context.userId).toBe(mockUser.id);
    });
  });
});
