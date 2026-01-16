# CEDA-80: GitHub OAuth Integration

## Overview

Add GitHub OAuth to CEDA for git-based identity verification. Users register via GitHub, CEDA learns their orgs/repos, Herald authenticates by git remote.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    getceda.com                               │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ /auth/github│───→│ UserProfile │───→│ GitIdentity │      │
│  │ OAuth flow  │    │ (mutable)   │    │ (immutable) │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│         │                                     │              │
│         ▼                                     ▼              │
│  ┌─────────────┐                      ┌─────────────┐       │
│  │ GitHub API  │                      │ Org/Repo    │       │
│  │ - orgs      │                      │ Registry    │       │
│  │ - repos     │                      │ (verified)  │       │
│  └─────────────┘                      └─────────────┘       │
│                                              │               │
│                                              ▼               │
│                                       ┌─────────────┐       │
│                                       │ /auth/verify│       │
│                                       │ Herald auth │       │
│                                       └─────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### GitIdentity (immutable - from GitHub API)

```typescript
interface GitIdentity {
  id: string;                    // CEDA internal ID
  githubId: number;              // GitHub user ID (immutable)
  githubLogin: string;           // GitHub username
  githubEmail: string;           // Primary GitHub email
  avatarUrl: string;             // GitHub avatar

  // Synced from GitHub API
  organizations: GitOrg[];       // Orgs user belongs to
  repositories: GitRepo[];       // Repos user has access to

  // Metadata
  syncedAt: string;              // Last sync with GitHub
  createdAt: string;
}

interface GitOrg {
  githubId: number;              // GitHub org ID
  login: string;                 // Org name (e.g., "Spilno-me")
  role: 'member' | 'admin';      // User's role in org
}

interface GitRepo {
  githubId: number;              // GitHub repo ID
  fullName: string;              // e.g., "Spilno-me/ceda"
  orgLogin: string;              // Parent org
  permission: 'read' | 'write' | 'admin';
}
```

### UserProfile (mutable - user preferences)

Extend existing `UserRecord` in `src/auth/auth.interface.ts`:

```typescript
interface UserRecord {
  // Existing fields...
  id: string;
  email: string;
  passwordHash: string;          // Optional if OAuth-only
  company: string;
  roles: UserRole[];

  // NEW: Git identity link
  gitIdentityId?: string;        // Link to GitIdentity
  authProvider: 'local' | 'github';

  // NEW: User preferences (mutable)
  preferences?: {
    defaultOrg?: string;         // Preferred org context
    customTags?: string[];       // User-defined tags
    vaultMappings?: Record<string, string>;  // repo -> vault
  };
}
```

## API Endpoints

### 1. GitHub OAuth Flow

#### `GET /api/auth/github`
Redirect to GitHub OAuth authorization.

```typescript
// Redirect to:
// https://github.com/login/oauth/authorize?
//   client_id={GITHUB_CLIENT_ID}&
//   redirect_uri={CEDA_URL}/api/auth/github/callback&
//   scope=read:user,read:org,repo&
//   state={random_state}
```

#### `GET /api/auth/github/callback`
Handle OAuth callback, create/update user.

```typescript
interface GitHubCallbackResponse {
  user: {
    id: string;
    email: string;
    githubLogin: string;
  };
  tokens: TokenPair;            // Reuse existing JWT infrastructure
  isNewUser: boolean;
  organizations: string[];       // Org names for UI display
}
```

**Flow:**
1. Exchange code for GitHub access token
2. Fetch user profile from GitHub API
3. Fetch user's organizations
4. Fetch user's repositories (paginated)
5. Create/update GitIdentity
6. Create/update UserRecord
7. Generate CEDA JWT tokens
8. Return response

### 2. Herald Authentication

#### `POST /api/auth/verify`
Verify Herald instance by git remote.

```typescript
interface VerifyRequest {
  gitRemote: string;             // e.g., "github.com/Spilno-me/ceda"
  user: string;                  // Local username (from whoami)
}

interface VerifyResponse {
  verified: boolean;
  context?: {
    userId: string;
    company: string;             // Derived from org
    project: string;             // Derived from repo
    tags: string[];              // Verified tags
    trust: 'HIGH';               // Always HIGH for verified
    propagates: true;            // Always true for verified
  };
  token?: string;                // Short-lived Herald token
  error?: string;
}
```

**Flow:**
1. Parse gitRemote to extract org/repo
2. Find GitIdentity with matching repo
3. Verify user has access to repo
4. Generate context from verified identity
5. Return Herald token

#### `POST /api/auth/refresh-git`
Manually trigger GitHub sync for user.

```typescript
interface RefreshGitRequest {
  // Uses JWT from Authorization header
}

interface RefreshGitResponse {
  organizations: GitOrg[];
  repositories: GitRepo[];
  syncedAt: string;
}
```

### 3. Profile Management

#### `GET /api/profile`
Get current user's profile and git identity.

#### `PATCH /api/profile/preferences`
Update user preferences (mutable layer).

## Environment Variables

Add to Railway/deployment:

```bash
# GitHub OAuth App
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# OAuth redirect - NOTE: frontend is app.getceda.com
CEDA_PUBLIC_URL=https://app.getceda.com
```

## Storage

Use existing Upstash Redis with new key prefixes:

```
git:identity:{githubId}     -> GitIdentity JSON
git:org:{orgLogin}          -> List of member githubIds
git:repo:{fullName}         -> List of user githubIds with access
user:{userId}:git           -> Link to githubId
```

## Implementation Tasks

### Phase 1: OAuth Flow
1. [ ] Add GitHub OAuth dependencies (if needed)
2. [ ] Create `/api/auth/github` redirect endpoint
3. [ ] Create `/api/auth/github/callback` handler
4. [ ] Implement GitHub API client (orgs, repos)
5. [ ] Create GitIdentity storage functions
6. [ ] Extend UserRecord with git fields
7. [ ] Add tests for OAuth flow

### Phase 2: Herald Verification
1. [ ] Create `/api/auth/verify` endpoint
2. [ ] Implement git remote parsing
3. [ ] Implement user-repo verification
4. [ ] Generate Herald context from verified identity
5. [ ] Add tests for verification

### Phase 3: Profile Management
1. [ ] Create `/api/profile` endpoints
2. [ ] Implement preferences storage
3. [ ] Add manual git refresh
4. [ ] Add tests

## Test User

Test with:
- GitHub: oleksiiorlov
- Org: Spilno-me
- Repos: ceda, herald-mcp

## Security Notes

1. GitHub tokens stored encrypted, refreshed on each login
2. GitIdentity is read-only after sync (source of truth)
3. UserPreferences can be modified but don't affect trust
4. Herald tokens are short-lived (15 min)
5. All git verification happens server-side

## Files to Create/Modify

### New Files
- `src/auth/github.service.ts` - GitHub OAuth + API client
- `src/auth/github.interface.ts` - GitHub-specific types
- `src/auth/git-identity.service.ts` - GitIdentity CRUD
- `src/auth/herald-verify.service.ts` - Herald verification

### Modify
- `src/auth/auth.interface.ts` - Extend UserRecord
- `src/auth/index.ts` - Export new services
- `src/server.ts` - Add new routes

## Success Criteria

1. User can login via GitHub OAuth
2. CEDA stores user's orgs and repos
3. Herald can verify by git remote
4. Verified Herald gets HIGH trust context
5. Test passes with oleksiiorlov/Spilno-me/ceda
