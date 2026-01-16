/**
 * CEDA-80: Herald Verify Service
 *
 * Validates Herald instances by git remote URL.
 * Provides HIGH trust context for verified Heralds with repository access.
 */

import * as jwt from 'jsonwebtoken';
import {
  HeraldVerifyRequest,
  HeraldVerifyResponse,
  HeraldVerifyContext,
  ParsedGitRemote,
  GitIdentity,
} from './github.interface';
import { GitIdentityService } from './git-identity.service';
import { getJwtConfig } from './jwt.config';

/**
 * Herald Verify Service
 * Validates Herald by git remote and provides trust context
 */
export class HeraldVerifyService {
  private gitIdentityService: GitIdentityService;

  constructor(gitIdentityService?: GitIdentityService) {
    this.gitIdentityService = gitIdentityService || new GitIdentityService();
  }

  /**
   * Verify Herald by git remote URL
   */
  async verify(request: HeraldVerifyRequest): Promise<HeraldVerifyResponse> {
    const { gitRemote, user } = request;

    // Parse git remote URL
    const parsed = this.parseGitRemote(gitRemote);
    if (!parsed) {
      return {
        verified: false,
        error: 'Invalid git remote format. Expected: github.com/org/repo',
      };
    }

    const { org, repo } = parsed;
    const repoFullName = `${org}/${repo}`;

    // Find users with access to this repo
    const userIds = await this.gitIdentityService.findUsersByRepo(repoFullName);
    if (userIds.length === 0) {
      return {
        verified: false,
        error: `No registered users for repository: ${repoFullName}`,
      };
    }

    // If user is specified, try to match by login
    let identity: GitIdentity | null = null;

    if (user) {
      identity = await this.gitIdentityService.findByLogin(user);
      if (identity) {
        // Verify this user has access to the repo
        const hasAccess = await this.gitIdentityService.hasRepoAccess(identity.githubId, repoFullName);
        if (!hasAccess) {
          return {
            verified: false,
            error: `User ${user} does not have access to ${repoFullName}`,
          };
        }
      }
    }

    // If no user specified or user not found, use first user with access
    if (!identity) {
      const githubId = userIds[0];
      identity = await this.gitIdentityService.findByGithubId(githubId);
    }

    if (!identity) {
      return {
        verified: false,
        error: 'Git identity not found',
      };
    }

    // Get permission level for trust context
    const permission = await this.gitIdentityService.getRepoPermission(identity.githubId, repoFullName);

    // Build verification context
    const context: HeraldVerifyContext = {
      userId: identity.id,
      company: org,
      project: repo,
      tags: [org, repo, `github:${identity.githubLogin}`],
      trust: 'HIGH',
      propagates: true,
    };

    // Add permission-based tags
    if (permission === 'admin') {
      context.tags.push('admin');
    } else if (permission === 'write') {
      context.tags.push('contributor');
    }

    // Generate short-lived Herald token
    const token = this.generateHeraldToken(identity, context);

    return {
      verified: true,
      context,
      token,
    };
  }

  /**
   * Parse git remote URL to extract org and repo
   * Supports formats:
   * - github.com/org/repo
   * - github.com:org/repo
   * - https://github.com/org/repo
   * - git@github.com:org/repo.git
   */
  parseGitRemote(remote: string): ParsedGitRemote | null {
    // Normalize the remote URL
    let normalized = remote.trim();

    // Remove protocol prefix
    normalized = normalized.replace(/^(https?:\/\/|git@)/, '');

    // Handle SSH format (github.com:org/repo)
    normalized = normalized.replace('github.com:', 'github.com/');

    // Match github.com/org/repo pattern
    const match = normalized.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) {
      return null;
    }

    const org = match[1];
    let repo = match[2];

    // Remove .git suffix if present
    repo = repo.replace(/\.git$/, '');

    return { org, repo };
  }

  /**
   * Generate short-lived JWT token for Herald
   */
  private generateHeraldToken(identity: GitIdentity, context: HeraldVerifyContext): string {
    const config = getJwtConfig();

    const payload = {
      sub: identity.id,
      type: 'herald',
      githubId: identity.githubId,
      githubLogin: identity.githubLogin,
      company: context.company,
      project: context.project,
      trust: context.trust,
    };

    return jwt.sign(payload, config.accessSecret, {
      expiresIn: '1h', // Short-lived token for Herald
      issuer: config.issuer,
      audience: config.audience,
    });
  }

  /**
   * Verify Herald token
   */
  verifyHeraldToken(token: string): {
    valid: boolean;
    payload?: {
      sub: string;
      type: string;
      githubId: number;
      githubLogin: string;
      company: string;
      project: string;
      trust: string;
    };
    error?: string;
  } {
    try {
      const config = getJwtConfig();
      const payload = jwt.verify(token, config.accessSecret, {
        issuer: config.issuer,
        audience: config.audience,
      }) as {
        sub: string;
        type: string;
        githubId: number;
        githubLogin: string;
        company: string;
        project: string;
        trust: string;
      };

      if (payload.type !== 'herald') {
        return {
          valid: false,
          error: 'Invalid token type',
        };
      }

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Token verification failed',
      };
    }
  }
}
