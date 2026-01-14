/**
 * CEDA API Key Guard Tests
 * CEDA-70.5: API Key Guard
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import {
  ApiKeyGuard,
  InMemoryApiKeyStore,
  CombinedAuthGuard,
  extractApiKey,
} from './api-key.guard';
import { JwtGuard, AuthenticatedRequest } from './jwt.guard';
import { AuthService } from './auth.service';
import { ApiKeyRecord, UserRole, UserRecord } from './auth.interface';
import { resetJwtConfig } from './jwt.config';

describe('ApiKeyGuard', () => {
  let apiKeyGuard: ApiKeyGuard;
  let keyStore: InMemoryApiKeyStore;
  let authService: AuthService;

  const mockApiKey = 'ceda_acme_' + 'a'.repeat(48);
  let mockKeyHash: string;

  const mockKeyRecord: ApiKeyRecord = {
    id: 'key-123',
    userId: 'user-456',
    company: 'acme',
    keyHash: '', // Will be set in beforeEach
    name: 'Test Key',
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
    (res as any).writeHead = jest.fn().mockReturnValue(res);
    (res as any).end = jest.fn().mockReturnValue(res);
    return res;
  }

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
    keyStore = new InMemoryApiKeyStore();
    apiKeyGuard = new ApiKeyGuard(keyStore, authService);

    // Set up mock key
    mockKeyHash = authService.hashApiKey(mockApiKey);
    mockKeyRecord.keyHash = mockKeyHash;
    keyStore.addKey(mockKeyHash, { ...mockKeyRecord });
  });

  afterEach(() => {
    resetJwtConfig();
    keyStore.clear();
  });

  describe('validate', () => {
    it('should reject request without X-API-Key header', async () => {
      const req = createMockRequest();
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Missing X-API-Key header');
    });

    it('should reject invalid API key format', async () => {
      const req = createMockRequest({ 'x-api-key': 'invalid-key' });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Invalid API key format');
    });

    it('should reject unknown API key', async () => {
      const unknownKey = 'ceda_unknown_' + 'b'.repeat(48);
      const req = createMockRequest({ 'x-api-key': unknownKey });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.statusCode).toBe(401);
      expect(result.error?.message).toBe('Invalid API key');
    });

    it('should accept valid API key and extract context', async () => {
      const req = createMockRequest({ 'x-api-key': mockApiKey });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.userId).toBe(mockKeyRecord.userId);
      expect(result.context?.company).toBe(mockKeyRecord.company);
      expect(result.context?.roles).toEqual(mockKeyRecord.roles);
      expect(result.context?.authMethod).toBe('api_key');
    });

    it('should reject revoked API key', async () => {
      // Add a revoked key
      const revokedKey = 'ceda_revoked_' + 'c'.repeat(48);
      const revokedHash = authService.hashApiKey(revokedKey);
      keyStore.addKey(revokedHash, {
        ...mockKeyRecord,
        id: 'key-revoked',
        keyHash: revokedHash,
        isActive: false,
      });

      const req = createMockRequest({ 'x-api-key': revokedKey });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.message).toBe('API key has been revoked');
    });

    it('should reject expired API key', async () => {
      // Add an expired key
      const expiredKey = 'ceda_expired_' + 'd'.repeat(48);
      const expiredHash = authService.hashApiKey(expiredKey);
      keyStore.addKey(expiredHash, {
        ...mockKeyRecord,
        id: 'key-expired',
        keyHash: expiredHash,
        expiresAt: '2020-01-01T00:00:00Z', // Past date
      });

      const req = createMockRequest({ 'x-api-key': expiredKey });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(false);
      expect(result.error?.message).toBe('API key has expired');
    });

    it('should include project in context if set', async () => {
      // Add key with project
      const projectKey = 'ceda_project_' + 'e'.repeat(48);
      const projectHash = authService.hashApiKey(projectKey);
      keyStore.addKey(projectHash, {
        ...mockKeyRecord,
        id: 'key-project',
        keyHash: projectHash,
        project: 'my-project',
      });

      const req = createMockRequest({ 'x-api-key': projectKey });
      const result = await apiKeyGuard.validate(req);

      expect(result.authenticated).toBe(true);
      expect(result.context?.project).toBe('my-project');
    });
  });

  describe('guard', () => {
    it('should send 401 response for unauthenticated request', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const passed = await apiKeyGuard.guard(req, res);

      expect(passed).toBe(false);
      expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
    });

    it('should pass and inject context for authenticated request', async () => {
      const req = createMockRequest({ 'x-api-key': mockApiKey });
      const res = createMockResponse();

      const passed = await apiKeyGuard.guard(req, res);

      expect(passed).toBe(true);
      expect(req.auth).toBeDefined();
      expect(req.auth?.userId).toBe(mockKeyRecord.userId);
    });
  });
});

describe('CombinedAuthGuard', () => {
  let combinedGuard: CombinedAuthGuard;
  let jwtGuard: JwtGuard;
  let apiKeyGuard: ApiKeyGuard;
  let keyStore: InMemoryApiKeyStore;
  let authService: AuthService;

  const mockApiKey = 'ceda_combo_' + 'f'.repeat(48);
  const mockUser: UserRecord = {
    id: 'user-jwt',
    email: 'jwt@example.com',
    passwordHash: '',
    company: 'jwtco',
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

  function createMockResponse(): ServerResponse {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    const res = new ServerResponse(req);
    (res as any).writeHead = jest.fn().mockReturnValue(res);
    (res as any).end = jest.fn().mockReturnValue(res);
    return res;
  }

  beforeEach(() => {
    resetJwtConfig();
    authService = new AuthService();
    keyStore = new InMemoryApiKeyStore();
    jwtGuard = new JwtGuard(authService);
    apiKeyGuard = new ApiKeyGuard(keyStore, authService);
    combinedGuard = new CombinedAuthGuard(jwtGuard, apiKeyGuard);

    // Set up mock API key
    const mockKeyHash = authService.hashApiKey(mockApiKey);
    keyStore.addKey(mockKeyHash, {
      id: 'key-combo',
      userId: 'user-api',
      company: 'apico',
      keyHash: mockKeyHash,
      name: 'Combo Key',
      roles: [UserRole.CONTRIBUTOR],
      createdAt: new Date().toISOString(),
      isActive: true,
    });
  });

  afterEach(() => {
    resetJwtConfig();
    keyStore.clear();
  });

  it('should reject request without any auth', async () => {
    const req = createMockRequest();
    const result = await combinedGuard.validate(req);

    expect(result.authenticated).toBe(false);
    expect(result.error?.message).toContain('Missing authentication');
  });

  it('should authenticate via JWT when provided', async () => {
    const tokens = authService.generateTokenPair(mockUser);
    const req = createMockRequest({ authorization: `Bearer ${tokens.accessToken}` });
    const result = await combinedGuard.validate(req);

    expect(result.authenticated).toBe(true);
    expect(result.context?.authMethod).toBe('jwt');
    expect(result.context?.userId).toBe(mockUser.id);
  });

  it('should authenticate via API key when provided', async () => {
    const req = createMockRequest({ 'x-api-key': mockApiKey });
    const result = await combinedGuard.validate(req);

    expect(result.authenticated).toBe(true);
    expect(result.context?.authMethod).toBe('api_key');
  });

  it('should prefer JWT over API key when both provided', async () => {
    const tokens = authService.generateTokenPair(mockUser);
    const req = createMockRequest({
      authorization: `Bearer ${tokens.accessToken}`,
      'x-api-key': mockApiKey,
    });
    const result = await combinedGuard.validate(req);

    expect(result.authenticated).toBe(true);
    expect(result.context?.authMethod).toBe('jwt');
    expect(result.context?.userId).toBe(mockUser.id);
  });

  it('should return JWT error if JWT provided but invalid', async () => {
    const req = createMockRequest({
      authorization: 'Bearer invalid-token',
      'x-api-key': mockApiKey, // Valid API key, but JWT takes precedence
    });
    const result = await combinedGuard.validate(req);

    // Should return JWT error, not fall through to API key
    expect(result.authenticated).toBe(false);
    expect(result.error?.message).not.toBe('Invalid API key');
  });
});

describe('extractApiKey', () => {
  function createMockRequest(headers: Record<string, string> = {}): IncomingMessage {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    Object.assign(req.headers, headers);
    return req;
  }

  it('should return null without header', () => {
    const req = createMockRequest();
    expect(extractApiKey(req)).toBeNull();
  });

  it('should extract API key from header', () => {
    const req = createMockRequest({ 'x-api-key': 'my-api-key' });
    expect(extractApiKey(req)).toBe('my-api-key');
  });
});
