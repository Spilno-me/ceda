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
