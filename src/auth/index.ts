/**
 * CEDA Authentication Module
 * CEDA-70: Authentication Epic
 */

// Interfaces
export {
  JwtPayload,
  UserRole,
  ApiKeyRecord,
  UserRecord,
  TokenPair,
  AuthContext,
  LoginRequest,
  RefreshRequest,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from './auth.interface';

// GitHub OAuth Interfaces (CEDA-80)
export {
  GitHubUser,
  GitHubOrg,
  GitHubRepo,
  GitHubTokenResponse,
  GitOrgMembership,
  GitRepoAccess,
  GitIdentity,
  HeraldVerifyRequest,
  HeraldVerifyContext,
  HeraldVerifyResponse,
  OAuthCallbackResponse,
  ParsedGitRemote,
} from './github.interface';

// Configuration
export {
  JwtConfig,
  loadJwtConfig,
  validateJwtConfig,
  getJwtConfig,
  resetJwtConfig,
  parseDuration,
  parseDurationSeconds,
} from './jwt.config';

// Services
export { AuthService } from './auth.service';
export { GitHubService } from './github.service';
export { GitIdentityService } from './git-identity.service';
export { HeraldVerifyService } from './herald-verify.service';
export { WorkOSService, getWorkOSService, WorkOSUser, WorkOSAuthResult } from './workos.service';

// Guards
export {
  JwtGuard,
  OptionalJwtGuard,
  AuthenticatedRequest,
  GuardResult,
  AuthError,
  extractBearerToken,
  isAuthenticated,
  getAuthContext,
} from './jwt.guard';

export {
  ApiKeyGuard,
  ApiKeyLookup,
  InMemoryApiKeyStore,
  CombinedAuthGuard,
  extractApiKey,
} from './api-key.guard';
