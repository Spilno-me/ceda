/**
 * CEDA-80: Herald Verify Service Tests
 */

import { HeraldVerifyService } from './herald-verify.service';
import { GitIdentityService } from './git-identity.service';
import { GitIdentity } from './github.interface';

// Mock GitIdentityService
jest.mock('./git-identity.service');

describe('HeraldVerifyService', () => {
  let service: HeraldVerifyService;
  let mockGitIdentityService: jest.Mocked<GitIdentityService>;

  const mockIdentity: GitIdentity = {
    id: 'git_12345',
    githubId: 12345,
    githubLogin: 'testuser',
    githubEmail: 'test@example.com',
    avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
    organizations: [
      { githubId: 1, login: 'Spilno-me', role: 'member' },
    ],
    repositories: [
      { githubId: 100, fullName: 'Spilno-me/ceda', orgLogin: 'Spilno-me', permission: 'write' },
      { githubId: 101, fullName: 'Spilno-me/herald-mcp', orgLogin: 'Spilno-me', permission: 'admin' },
    ],
    accessToken: 'gho_test_token',
    syncedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    // Set up JWT config
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    mockGitIdentityService = new GitIdentityService() as jest.Mocked<GitIdentityService>;
    service = new HeraldVerifyService(mockGitIdentityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  describe('parseGitRemote', () => {
    it('parses github.com/org/repo format', () => {
      const result = service.parseGitRemote('github.com/Spilno-me/ceda');
      expect(result).toEqual({ org: 'Spilno-me', repo: 'ceda' });
    });

    it('parses https://github.com/org/repo format', () => {
      const result = service.parseGitRemote('https://github.com/Spilno-me/ceda');
      expect(result).toEqual({ org: 'Spilno-me', repo: 'ceda' });
    });

    it('parses git@github.com:org/repo.git format', () => {
      const result = service.parseGitRemote('git@github.com:Spilno-me/ceda.git');
      expect(result).toEqual({ org: 'Spilno-me', repo: 'ceda' });
    });

    it('parses github.com:org/repo format', () => {
      const result = service.parseGitRemote('github.com:Spilno-me/ceda');
      expect(result).toEqual({ org: 'Spilno-me', repo: 'ceda' });
    });

    it('removes .git suffix', () => {
      const result = service.parseGitRemote('github.com/Spilno-me/ceda.git');
      expect(result).toEqual({ org: 'Spilno-me', repo: 'ceda' });
    });

    it('returns null for invalid format', () => {
      expect(service.parseGitRemote('invalid-url')).toBeNull();
      expect(service.parseGitRemote('gitlab.com/org/repo')).toBeNull();
      expect(service.parseGitRemote('')).toBeNull();
    });
  });

  describe('verify', () => {
    it('returns error for invalid git remote format', async () => {
      const result = await service.verify({ gitRemote: 'invalid-url' });

      expect(result.verified).toBe(false);
      expect(result.error).toContain('Invalid git remote format');
    });

    it('returns error when no users registered for repository', async () => {
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([]);

      const result = await service.verify({ gitRemote: 'github.com/unknown/repo' });

      expect(result.verified).toBe(false);
      expect(result.error).toContain('No registered users');
    });

    it('verifies valid git remote with registered user', async () => {
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);
      mockGitIdentityService.findByGithubId = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.getRepoPermission = jest.fn().mockResolvedValue('write');

      const result = await service.verify({ gitRemote: 'github.com/Spilno-me/ceda' });

      expect(result.verified).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.trust).toBe('HIGH');
      expect(result.context?.company).toBe('Spilno-me');
      expect(result.context?.project).toBe('ceda');
      expect(result.token).toBeDefined();
    });

    it('verifies with specific user when provided', async () => {
      mockGitIdentityService.findByLogin = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.hasRepoAccess = jest.fn().mockResolvedValue(true);
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);
      mockGitIdentityService.getRepoPermission = jest.fn().mockResolvedValue('admin');

      const result = await service.verify({
        gitRemote: 'github.com/Spilno-me/ceda',
        user: 'testuser',
      });

      expect(result.verified).toBe(true);
      expect(result.context?.tags).toContain('admin');
    });

    it('returns error when specified user lacks access', async () => {
      mockGitIdentityService.findByLogin = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.hasRepoAccess = jest.fn().mockResolvedValue(false);
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);

      const result = await service.verify({
        gitRemote: 'github.com/other-org/repo',
        user: 'testuser',
      });

      expect(result.verified).toBe(false);
      expect(result.error).toContain('does not have access');
    });

    it('includes contributor tag for write permission', async () => {
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);
      mockGitIdentityService.findByGithubId = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.getRepoPermission = jest.fn().mockResolvedValue('write');

      const result = await service.verify({ gitRemote: 'github.com/Spilno-me/ceda' });

      expect(result.context?.tags).toContain('contributor');
    });

    it('includes admin tag for admin permission', async () => {
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);
      mockGitIdentityService.findByGithubId = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.getRepoPermission = jest.fn().mockResolvedValue('admin');

      const result = await service.verify({ gitRemote: 'github.com/Spilno-me/ceda' });

      expect(result.context?.tags).toContain('admin');
    });
  });

  describe('verifyHeraldToken', () => {
    it('validates a valid herald token', async () => {
      // First generate a token through verify
      mockGitIdentityService.findUsersByRepo = jest.fn().mockResolvedValue([12345]);
      mockGitIdentityService.findByGithubId = jest.fn().mockResolvedValue(mockIdentity);
      mockGitIdentityService.getRepoPermission = jest.fn().mockResolvedValue('write');

      const verifyResult = await service.verify({ gitRemote: 'github.com/Spilno-me/ceda' });
      expect(verifyResult.token).toBeDefined();

      // Then verify the token
      const tokenResult = service.verifyHeraldToken(verifyResult.token!);
      expect(tokenResult.valid).toBe(true);
      expect(tokenResult.payload?.type).toBe('herald');
      expect(tokenResult.payload?.githubLogin).toBe('testuser');
    });

    it('rejects invalid token', () => {
      const result = service.verifyHeraldToken('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
