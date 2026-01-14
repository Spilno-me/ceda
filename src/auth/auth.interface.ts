/**
 * CEDA Authentication Interfaces
 * CEDA-70.1: JWT Infrastructure
 */

/**
 * JWT Token Payload
 * Contains user identity and authorization context
 */
export interface JwtPayload {
  /** User unique identifier */
  sub: string;
  /** User email */
  email: string;
  /** Company identifier for tenant isolation */
  company: string;
  /** Project identifier (optional) */
  project?: string;
  /** User roles for authorization */
  roles: UserRole[];
  /** Token type: access or refresh */
  type: 'access' | 'refresh';
  /** Issued at timestamp */
  iat?: number;
  /** Expiration timestamp */
  exp?: number;
}

/**
 * User roles for authorization
 */
export enum UserRole {
  /** Read-only access to patterns */
  READER = 'reader',
  /** Can create and modify patterns */
  CONTRIBUTOR = 'contributor',
  /** Full access to company resources */
  ADMIN = 'admin',
  /** Cross-company access (internal only) */
  SUPER_ADMIN = 'super_admin',
}

/**
 * API Key record stored in database
 */
export interface ApiKeyRecord {
  /** Unique key identifier */
  id: string;
  /** User who owns this key */
  userId: string;
  /** Company context */
  company: string;
  /** Project context (optional) */
  project?: string;
  /** SHA-256 hash of the API key */
  keyHash: string;
  /** Human-readable name */
  name: string;
  /** Key permissions */
  roles: UserRole[];
  /** Creation timestamp */
  createdAt: string;
  /** Last usage timestamp */
  lastUsedAt?: string;
  /** Expiration timestamp (optional) */
  expiresAt?: string;
  /** Whether the key is active */
  isActive: boolean;
}

/**
 * User record for authentication
 */
export interface UserRecord {
  /** Unique user identifier */
  id: string;
  /** User email (unique) */
  email: string;
  /** Bcrypt hashed password */
  passwordHash: string;
  /** Company identifier */
  company: string;
  /** User roles */
  roles: UserRole[];
  /** Creation timestamp */
  createdAt: string;
  /** Last login timestamp */
  lastLoginAt?: string;
  /** Whether the user is active */
  isActive: boolean;
}

/**
 * Token pair returned from authentication
 */
export interface TokenPair {
  /** Short-lived access token (1h) */
  accessToken: string;
  /** Long-lived refresh token (7d) */
  refreshToken: string;
  /** Access token expiration in seconds */
  expiresIn: number;
  /** Token type */
  tokenType: 'Bearer';
}

/**
 * Request context after authentication
 * Injected into request handlers
 */
export interface AuthContext {
  /** User identifier */
  userId: string;
  /** User email */
  email: string;
  /** Company identifier */
  company: string;
  /** Project identifier (optional) */
  project?: string;
  /** User roles */
  roles: UserRole[];
  /** Authentication method used */
  authMethod: 'jwt' | 'api_key';
}

/**
 * Login request payload
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Refresh token request payload
 */
export interface RefreshRequest {
  refreshToken: string;
}

/**
 * API key creation request
 */
export interface CreateApiKeyRequest {
  /** Human-readable name for the key */
  name: string;
  /** Project scope (optional) */
  project?: string;
  /** Roles for this key (defaults to user's roles) */
  roles?: UserRole[];
  /** Expiration in days (optional, defaults to never) */
  expiresInDays?: number;
}

/**
 * API key creation response
 * NOTE: The plaintext key is only returned once at creation
 */
export interface CreateApiKeyResponse {
  /** Key identifier */
  id: string;
  /** Key name */
  name: string;
  /** The actual API key (only shown once!) */
  key: string;
  /** Key prefix for identification (first 8 chars) */
  keyPrefix: string;
  /** Creation timestamp */
  createdAt: string;
  /** Expiration timestamp */
  expiresAt?: string;
}
