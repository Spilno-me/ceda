/**
 * CEDA-80: GitHub OAuth Service
 *
 * Handles GitHub OAuth flow including:
 * - Authorization URL generation
 * - Code exchange for access token
 * - Fetching user profile, organizations, and repositories
 */

import {
  GitHubUser,
  GitHubOrg,
  GitHubRepo,
  GitHubTokenResponse,
} from './github.interface';

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

/**
 * GitHub OAuth Service
 * Handles OAuth flow and GitHub API interactions
 */
export class GitHubService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID || '';
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    const publicUrl = process.env.CEDA_PUBLIC_URL || 'http://localhost:3030';
    this.redirectUri = `${publicUrl}/api/auth/github/callback`;
  }

  /**
   * Check if GitHub OAuth is configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate GitHub OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'read:user read:org repo',
      state,
    });
    return `${GITHUB_OAUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string): Promise<string> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      }),
    });

    const data: GitHubTokenResponse = await response.json();

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    if (!data.access_token) {
      throw new Error('No access token received from GitHub');
    }

    return data.access_token;
  }

  /**
   * Fetch authenticated user profile
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CEDA-OAuth',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch user's organizations
   */
  async getOrganizations(accessToken: string): Promise<GitHubOrg[]> {
    const response = await fetch(`${GITHUB_API_URL}/user/orgs`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CEDA-OAuth',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch user's repositories with pagination
   * Includes personal repos AND org repos
   */
  async getRepositories(accessToken: string, orgs?: GitHubOrg[]): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    const seenIds = new Set<number>();

    // 1. Fetch user's repos (includes repos user owns + has explicit access to)
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `${GITHUB_API_URL}/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'CEDA-OAuth',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const batch: GitHubRepo[] = await response.json();

      if (batch.length === 0) {
        break;
      }

      for (const repo of batch) {
        if (!seenIds.has(repo.id)) {
          seenIds.add(repo.id);
          repos.push(repo);
        }
      }
      page++;

      // Safety limit
      if (page > 50) {
        console.warn('[GitHubService] Reached pagination limit for user repos');
        break;
      }
    }

    // 2. Also fetch repos from each org (in case user/repos missed some)
    if (orgs && orgs.length > 0) {
      for (const org of orgs) {
        try {
          let orgPage = 1;
          while (true) {
            const response = await fetch(
              `${GITHUB_API_URL}/orgs/${org.login}/repos?per_page=${perPage}&page=${orgPage}&sort=updated`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/vnd.github.v3+json',
                  'User-Agent': 'CEDA-OAuth',
                },
              }
            );

            if (!response.ok) {
              // Skip if no access to org repos
              console.warn(`[GitHubService] Cannot access repos for org ${org.login}: ${response.status}`);
              break;
            }

            const batch: GitHubRepo[] = await response.json();

            if (batch.length === 0) {
              break;
            }

            for (const repo of batch) {
              if (!seenIds.has(repo.id)) {
                seenIds.add(repo.id);
                repos.push(repo);
              }
            }
            orgPage++;

            // Limit per org
            if (orgPage > 10) {
              break;
            }
          }
        } catch (err) {
          console.warn(`[GitHubService] Error fetching repos for org ${org.login}:`, err);
        }
      }
    }

    console.log(`[GitHubService] Fetched ${repos.length} total repositories`);
    return repos;
  }

  /**
   * Fetch user's primary email if not public
   */
  async getPrimaryEmail(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'CEDA-OAuth',
        },
      });

      if (!response.ok) {
        return null;
      }

      const emails: Array<{ email: string; primary: boolean; verified: boolean }> = await response.json();
      const primary = emails.find(e => e.primary && e.verified);
      return primary?.email || null;
    } catch {
      return null;
    }
  }
}
