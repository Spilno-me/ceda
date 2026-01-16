/**
 * CEDA-80: GitHub Service Tests
 */

import { GitHubService } from './github.service';

describe('GitHubService', () => {
  let service: GitHubService;

  beforeEach(() => {
    // Reset environment variables for each test
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.CEDA_PUBLIC_URL = 'https://getceda.com';
    service = new GitHubService();
  });

  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.CEDA_PUBLIC_URL;
  });

  describe('isConfigured', () => {
    it('returns true when credentials are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when client ID is missing', () => {
      delete process.env.GITHUB_CLIENT_ID;
      const unconfiguredService = new GitHubService();
      expect(unconfiguredService.isConfigured()).toBe(false);
    });

    it('returns false when client secret is missing', () => {
      delete process.env.GITHUB_CLIENT_SECRET;
      const unconfiguredService = new GitHubService();
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('generates correct authorization URL with state', () => {
      const state = 'test-state-123';
      const url = service.getAuthorizationUrl(state);

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('scope=read%3Auser+read%3Aorg+repo');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fgetceda.com%2Fapi%2Fauth%2Fgithub%2Fcallback');
    });

    it('uses default localhost URL when CEDA_PUBLIC_URL is not set', () => {
      delete process.env.CEDA_PUBLIC_URL;
      const localService = new GitHubService();
      const url = localService.getAuthorizationUrl('state');

      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3030%2Fapi%2Fauth%2Fgithub%2Fcallback');
    });
  });

  describe('exchangeCode', () => {
    it('throws error when no access token received', async () => {
      // Mock fetch to return empty response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({}),
      });

      await expect(service.exchangeCode('test-code')).rejects.toThrow(
        'No access token received from GitHub'
      );

      global.fetch = originalFetch;
    });

    it('throws error when GitHub returns error', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        }),
      });

      await expect(service.exchangeCode('invalid-code')).rejects.toThrow(
        'GitHub OAuth error: The code passed is incorrect or expired.'
      );

      global.fetch = originalFetch;
    });

    it('returns access token on success', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({
          access_token: 'gho_test_token_123',
          token_type: 'bearer',
          scope: 'read:user,read:org,repo',
        }),
      });

      const token = await service.exchangeCode('valid-code');
      expect(token).toBe('gho_test_token_123');

      global.fetch = originalFetch;
    });
  });

  describe('getUser', () => {
    it('fetches user profile with correct headers', async () => {
      const mockUser = {
        id: 12345,
        login: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      };

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

      const user = await service.getUser('test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(user).toEqual(mockUser);

      global.fetch = originalFetch;
    });

    it('throws error on API failure', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(service.getUser('invalid-token')).rejects.toThrow(
        'GitHub API error: 401 Unauthorized'
      );

      global.fetch = originalFetch;
    });
  });

  describe('getOrganizations', () => {
    it('fetches user organizations', async () => {
      const mockOrgs = [
        { id: 1, login: 'org1', description: 'Org 1' },
        { id: 2, login: 'org2', description: 'Org 2' },
      ];

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOrgs),
      });

      const orgs = await service.getOrganizations('test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/orgs',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(orgs).toEqual(mockOrgs);

      global.fetch = originalFetch;
    });
  });

  describe('getRepositories', () => {
    it('fetches repositories with pagination', async () => {
      const mockReposPage1 = Array(100).fill(null).map((_, i) => ({
        id: i,
        name: `repo-${i}`,
        full_name: `user/repo-${i}`,
      }));
      const mockReposPage2 = [
        { id: 100, name: 'repo-100', full_name: 'user/repo-100' },
      ];

      const originalFetch = global.fetch;
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockReposPage1),
          });
        } else if (callCount === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockReposPage2),
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
      });

      const repos = await service.getRepositories('test-token');

      expect(repos.length).toBe(101);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      global.fetch = originalFetch;
    });
  });

  describe('getPrimaryEmail', () => {
    it('returns primary verified email', async () => {
      const mockEmails = [
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
      ];

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEmails),
      });

      const email = await service.getPrimaryEmail('test-token');
      expect(email).toBe('primary@example.com');

      global.fetch = originalFetch;
    });

    it('returns null when no primary email found', async () => {
      const mockEmails = [
        { email: 'unverified@example.com', primary: true, verified: false },
      ];

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockEmails),
      });

      const email = await service.getPrimaryEmail('test-token');
      expect(email).toBeNull();

      global.fetch = originalFetch;
    });

    it('returns null on API error', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const email = await service.getPrimaryEmail('test-token');
      expect(email).toBeNull();

      global.fetch = originalFetch;
    });
  });
});
