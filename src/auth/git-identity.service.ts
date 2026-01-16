/**
 * CEDA-80: Git Identity Service
 *
 * Manages git identity storage and retrieval using Upstash Redis.
 * Links GitHub accounts to CEDA users and indexes by org/repo for fast lookup.
 */

import {
  GitHubUser,
  GitHubOrg,
  GitHubRepo,
  GitIdentity,
  GitOrgMembership,
  GitRepoAccess,
} from './github.interface';

// Upstash REST API - no TCP connection needed
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

interface RedisResponse<T = unknown> {
  result: T;
  error?: string;
}

/**
 * Git Identity Service
 * Stores and retrieves git identities using Upstash Redis
 */
export class GitIdentityService {
  private enabled: boolean;

  constructor() {
    this.enabled = !!(UPSTASH_URL && UPSTASH_TOKEN);
    if (this.enabled) {
      console.log('[GitIdentityService] Initialized with Upstash Redis');
    } else {
      console.log('[GitIdentityService] Redis not configured - using in-memory fallback');
    }
  }

  /**
   * Check if Redis is available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Execute Redis command via REST API
   */
  private async execute<T = unknown>(command: string[]): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const response = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      });

      const data: RedisResponse<T> = await response.json();

      if (data.error) {
        console.error('[GitIdentityService] Redis error:', data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error('[GitIdentityService] Request failed:', error);
      return null;
    }
  }

  /**
   * Create or update git identity from GitHub data
   */
  async createOrUpdate(
    githubUser: GitHubUser,
    orgs: GitHubOrg[],
    repos: GitHubRepo[],
    accessToken: string,
    email?: string | null,
  ): Promise<GitIdentity> {
    const now = new Date().toISOString();

    // Check if identity already exists
    const existing = await this.findByGithubId(githubUser.id);

    const identity: GitIdentity = {
      id: `git_${githubUser.id}`,
      githubId: githubUser.id,
      githubLogin: githubUser.login,
      githubEmail: email || githubUser.email,
      avatarUrl: githubUser.avatar_url,
      organizations: orgs.map((o): GitOrgMembership => ({
        githubId: o.id,
        login: o.login,
        role: 'member', // GitHub API doesn't expose role easily without additional calls
      })),
      repositories: repos.map((r): GitRepoAccess => ({
        githubId: r.id,
        fullName: r.full_name,
        orgLogin: r.owner.login,
        permission: r.permissions?.admin ? 'admin' : r.permissions?.push ? 'write' : 'read',
      })),
      accessToken,
      syncedAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // Store identity in Redis
    await this.execute([
      'SET',
      `git:identity:${githubUser.id}`,
      JSON.stringify(identity),
    ]);

    // Index by login for username lookup
    await this.execute([
      'SET',
      `git:login:${githubUser.login.toLowerCase()}`,
      githubUser.id.toString(),
    ]);

    // Index by org for fast lookup
    for (const org of identity.organizations) {
      await this.execute([
        'SADD',
        `git:org:${org.login.toLowerCase()}:members`,
        githubUser.id.toString(),
      ]);
    }

    // Index by repo for Herald verification
    for (const repo of identity.repositories) {
      await this.execute([
        'SADD',
        `git:repo:${repo.fullName.toLowerCase()}:users`,
        githubUser.id.toString(),
      ]);
    }

    console.log(`[GitIdentityService] Stored identity for ${githubUser.login} (${orgs.length} orgs, ${repos.length} repos)`);

    return identity;
  }

  /**
   * Find git identity by GitHub ID
   */
  async findByGithubId(githubId: number): Promise<GitIdentity | null> {
    const data = await this.execute<string>(['GET', `git:identity:${githubId}`]);
    if (!data) return null;

    try {
      return JSON.parse(data) as GitIdentity;
    } catch {
      return null;
    }
  }

  /**
   * Find git identity by GitHub login
   */
  async findByLogin(login: string): Promise<GitIdentity | null> {
    const githubId = await this.execute<string>(['GET', `git:login:${login.toLowerCase()}`]);
    if (!githubId) return null;

    return this.findByGithubId(parseInt(githubId, 10));
  }

  /**
   * Find all GitHub user IDs with access to a repository
   */
  async findUsersByRepo(repoFullName: string): Promise<number[]> {
    const result = await this.execute<string[]>([
      'SMEMBERS',
      `git:repo:${repoFullName.toLowerCase()}:users`,
    ]);

    if (!result) return [];

    return result.map(id => parseInt(id, 10));
  }

  /**
   * Find all GitHub user IDs in an organization
   */
  async findUsersByOrg(orgLogin: string): Promise<number[]> {
    const result = await this.execute<string[]>([
      'SMEMBERS',
      `git:org:${orgLogin.toLowerCase()}:members`,
    ]);

    if (!result) return [];

    return result.map(id => parseInt(id, 10));
  }

  /**
   * Check if a user has access to a repository
   */
  async hasRepoAccess(githubId: number, repoFullName: string): Promise<boolean> {
    const result = await this.execute<number>([
      'SISMEMBER',
      `git:repo:${repoFullName.toLowerCase()}:users`,
      githubId.toString(),
    ]);

    return result === 1;
  }

  /**
   * Check if a user is a member of an organization
   */
  async isOrgMember(githubId: number, orgLogin: string): Promise<boolean> {
    const result = await this.execute<number>([
      'SISMEMBER',
      `git:org:${orgLogin.toLowerCase()}:members`,
      githubId.toString(),
    ]);

    return result === 1;
  }

  /**
   * Delete git identity and all indexes
   */
  async delete(githubId: number): Promise<boolean> {
    const identity = await this.findByGithubId(githubId);
    if (!identity) return false;

    // Remove from org indexes
    for (const org of identity.organizations) {
      await this.execute([
        'SREM',
        `git:org:${org.login.toLowerCase()}:members`,
        githubId.toString(),
      ]);
    }

    // Remove from repo indexes
    for (const repo of identity.repositories) {
      await this.execute([
        'SREM',
        `git:repo:${repo.fullName.toLowerCase()}:users`,
        githubId.toString(),
      ]);
    }

    // Remove login index
    await this.execute(['DEL', `git:login:${identity.githubLogin.toLowerCase()}`]);

    // Remove identity
    await this.execute(['DEL', `git:identity:${githubId}`]);

    console.log(`[GitIdentityService] Deleted identity for ${identity.githubLogin}`);

    return true;
  }

  /**
   * Get repository permission level for a user
   */
  async getRepoPermission(githubId: number, repoFullName: string): Promise<'read' | 'write' | 'admin' | null> {
    const identity = await this.findByGithubId(githubId);
    if (!identity) return null;

    const repo = identity.repositories.find(
      r => r.fullName.toLowerCase() === repoFullName.toLowerCase()
    );

    return repo?.permission || null;
  }
}
