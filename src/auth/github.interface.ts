/**
 * CEDA-80: GitHub OAuth Interfaces
 *
 * Type definitions for GitHub OAuth integration and git identity management.
 */

/**
 * GitHub user profile from /user endpoint
 */
export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
  html_url: string;
  type: string;
  created_at: string;
  updated_at: string;
}

/**
 * GitHub organization from /user/orgs endpoint
 */
export interface GitHubOrg {
  id: number;
  login: string;
  description: string | null;
  avatar_url: string;
  url: string;
}

/**
 * GitHub repository from /user/repos endpoint
 */
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    type: string;
  };
  html_url: string;
  description: string | null;
  fork: boolean;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  created_at: string;
  updated_at: string;
}

/**
 * GitHub OAuth token response
 */
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

/**
 * Organization membership in git identity
 */
export interface GitOrgMembership {
  githubId: number;
  login: string;
  role: 'member' | 'admin' | 'owner';
}

/**
 * Repository access in git identity
 */
export interface GitRepoAccess {
  githubId: number;
  fullName: string;
  orgLogin: string;
  permission: 'read' | 'write' | 'admin';
}

/**
 * Git identity stored in Redis
 * Links GitHub account to CEDA user
 */
export interface GitIdentity {
  id: string;
  githubId: number;
  githubLogin: string;
  githubEmail: string | null;
  avatarUrl: string;
  organizations: GitOrgMembership[];
  repositories: GitRepoAccess[];
  accessToken: string;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Herald verification request
 */
export interface HeraldVerifyRequest {
  gitRemote: string;
  user?: string;
}

/**
 * Herald verification context
 */
export interface HeraldVerifyContext {
  userId: string;
  company: string;
  project: string;
  tags: string[];
  trust: 'LOW' | 'MEDIUM' | 'HIGH';
  propagates: boolean;
}

/**
 * Herald verification response
 */
export interface HeraldVerifyResponse {
  verified: boolean;
  error?: string;
  context?: HeraldVerifyContext;
  token?: string;
}

/**
 * OAuth callback response
 */
export interface OAuthCallbackResponse {
  user: {
    id: string;
    email: string | null;
    githubLogin: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
  };
  isNewUser: boolean;
  organizations: string[];
}

/**
 * Parsed git remote URL
 */
export interface ParsedGitRemote {
  org: string;
  repo: string;
}
