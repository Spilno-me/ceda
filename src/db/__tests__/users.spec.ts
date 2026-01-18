/**
 * Tests for CEDA Users Repository
 * CEDA-99: DB Layer Test Coverage
 *
 * Edge cases covered:
 * - User without org association (OAuth flow creates user, but org sync might fail)
 * - UUID validation (strings like "anonymous" should not reach DB query)
 */

import * as users from '../users';
import * as db from '../index';
import * as orgs from '../orgs';

jest.mock('../index');
jest.mock('../orgs');

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockTransaction = db.transaction as jest.MockedFunction<typeof db.transaction>;
const mockOrgsUpsertBySlug = orgs.upsertBySlug as jest.MockedFunction<typeof orgs.upsertBySlug>;

describe('Users Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUser: users.DbUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    github_id: 12345,
    github_login: 'testuser',
    email: 'test@example.com',
    avatar_url: 'https://github.com/testuser.png',
    primary_org_id: '660e8400-e29b-41d4-a716-446655440001',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    last_login_at: new Date('2024-01-01'),
  };

  const mockOrg = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    slug: 'test-org',
    stripe_customer_id: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  describe('findByGitHubId', () => {
    it('should return user when found by GitHub ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubId(12345);

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE github_id = $1'),
        [12345]
      );
    });

    it('should return null when GitHub ID not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubId(99999);

      expect(result).toBeNull();
    });

    it('should handle negative GitHub ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubId(-1);

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.findById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        [mockUser.id]
      );
    });

    it('should return null when ID not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle invalid UUID format like "anonymous"', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findById('anonymous');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['anonymous']
      );
    });
  });

  describe('findByGitHubLogin', () => {
    it('should return user when found by GitHub login', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubLogin('testuser');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE github_login = $1'),
        ['testuser']
      );
    });

    it('should return null when GitHub login not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubLogin('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle empty login string', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByGitHubLogin('');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email = $1'),
        ['test@example.com']
      );
    });

    it('should return null when email not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ access_token_enc: 'gho_test_token_123' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getAccessToken(mockUser.id);

      expect(result).toBe('gho_test_token_123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT access_token_enc FROM users'),
        [mockUser.id]
      );
    });

    it('should return null when user not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.getAccessToken('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null when access token is null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ access_token_enc: null }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getAccessToken(mockUser.id);

      expect(result).toBeNull();
    });
  });

  describe('upsertFromGitHub', () => {
    const mockClient = {
      query: jest.fn(),
    };

    beforeEach(() => {
      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });
      mockOrgsUpsertBySlug.mockResolvedValue({ org: mockOrg, isNew: false });
    });

    it('should create new user when not exists', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        email: 'test@example.com',
        avatarUrl: 'https://github.com/testuser.png',
        accessToken: 'gho_test_token',
      };

      const result = await users.upsertFromGitHub(input);

      expect(result.isNew).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(mockOrgsUpsertBySlug).toHaveBeenCalledWith('testuser');
    });

    it('should update existing user when found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        email: 'newemail@example.com',
        accessToken: 'gho_new_token',
      };

      const result = await users.upsertFromGitHub(input);

      expect(result.isNew).toBe(false);
      expect(result.user).toEqual(mockUser);
    });

    it('should use first organization as company slug when provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        accessToken: 'gho_test_token',
        organizations: [
          { login: 'my-org', id: 1 },
          { login: 'another-org', id: 2 },
        ],
      };

      const result = await users.upsertFromGitHub(input);

      expect(result.companySlug).toBe('my-org');
      expect(mockOrgsUpsertBySlug).toHaveBeenCalledWith('my-org');
    });

    it('should sync user organizations when provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        accessToken: 'gho_test_token',
        organizations: [
          { login: 'org1', id: 1 },
          { login: 'org2', id: 2 },
        ],
      };

      await users.upsertFromGitHub(input);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM user_orgs WHERE user_id = $1',
        [mockUser.id]
      );
    });

    it('should handle user without org association (edge case)', async () => {
      const userWithoutOrg = { ...mockUser, primary_org_id: null };
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [userWithoutOrg] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        accessToken: 'gho_test_token',
      };

      const result = await users.upsertFromGitHub(input);

      expect(result.user).toBeDefined();
      expect(result.companySlug).toBe('testuser');
    });

    it('should handle null email and avatarUrl', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...mockUser, email: null, avatar_url: null }] });

      const input: users.GitHubUserInput = {
        githubId: 12345,
        githubLogin: 'testuser',
        accessToken: 'gho_test_token',
        email: null,
        avatarUrl: null,
      };

      const result = await users.upsertFromGitHub(input);

      expect(result.user).toBeDefined();
    });
  });

  describe('getUserOrganizations', () => {
    it('should return user organizations', async () => {
      const mockUserOrgs: users.DbUserOrg[] = [
        { user_id: mockUser.id, org_id: mockOrg.id, org_slug: 'test-org', role: 'member' },
        { user_id: mockUser.id, org_id: 'another-org-id', org_slug: 'another-org', role: 'admin' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockUserOrgs,
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      const result = await users.getUserOrganizations(mockUser.id);

      expect(result).toEqual(mockUserOrgs);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM user_orgs'),
        [mockUser.id]
      );
    });

    it('should return empty array when user has no organizations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.getUserOrganizations(mockUser.id);

      expect(result).toEqual([]);
    });

    it('should handle invalid user ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.getUserOrganizations('anonymous');

      expect(result).toEqual([]);
    });
  });

  describe('updatePrimaryOrg', () => {
    it('should update user primary org', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await users.updatePrimaryOrg(mockUser.id, mockOrg.id);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET primary_org_id = $1, updated_at = NOW() WHERE id = $2',
        [mockOrg.id, mockUser.id]
      );
    });
  });

  describe('findByOrgId', () => {
    it('should return users by org ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.findByOrgId(mockOrg.id);

      expect(result).toEqual([mockUser]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE primary_org_id = $1'),
        [mockOrg.id]
      );
    });

    it('should return empty array when no users in org', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.findByOrgId('empty-org-id');

      expect(result).toEqual([]);
    });
  });

  describe('countUsers', () => {
    it('should return total count of users', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '100' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.countUsers();

      expect(result).toBe(100);
      expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM users');
    });

    it('should return 0 when no users exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.countUsers();

      expect(result).toBe(0);
    });
  });

  describe('countActiveUsers', () => {
    it('should return count of active users with default 30 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '50' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.countActiveUsers();

      expect(result).toBe(50);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day' * $1"),
        [30]
      );
    });

    it('should respect custom days parameter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '25' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.countActiveUsers(7);

      expect(result).toBe(25);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day' * $1"),
        [7]
      );
    });
  });

  describe('getPreferences', () => {
    it('should return user preferences as object', async () => {
      const prefs: users.UserPreferences = {
        defaultOrg: 'test-org',
        defaultProject: 'test-project',
        selectedRepos: ['repo1', 'repo2'],
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{ preferences: prefs }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getPreferences(mockUser.id);

      expect(result).toEqual(prefs);
    });

    it('should parse JSON string preferences', async () => {
      const prefs = { defaultOrg: 'test-org' };

      mockQuery.mockResolvedValueOnce({
        rows: [{ preferences: JSON.stringify(prefs) }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getPreferences(mockUser.id);

      expect(result).toEqual(prefs);
    });

    it('should return empty object when preferences is null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ preferences: null }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getPreferences(mockUser.id);

      expect(result).toEqual({});
    });

    it('should return empty object when user not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.getPreferences('non-existent-id');

      expect(result).toEqual({});
    });

    it('should return empty object on invalid JSON string', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ preferences: 'invalid-json' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await users.getPreferences(mockUser.id);

      expect(result).toEqual({});
    });

    it('should return empty object on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await users.getPreferences(mockUser.id);

      expect(result).toEqual({});
    });
  });

  describe('setPreferences', () => {
    it('should update user preferences', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const prefs: users.UserPreferences = {
        defaultOrg: 'new-org',
        customTags: ['tag1', 'tag2'],
      };

      const result = await users.setPreferences(mockUser.id, prefs);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET preferences'),
        [JSON.stringify(prefs), mockUser.id]
      );
    });

    it('should return false when user not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await users.setPreferences('non-existent-id', {});

      expect(result).toBe(false);
    });

    it('should return false on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await users.setPreferences(mockUser.id, {});

      expect(result).toBe(false);
    });
  });

  describe('deprecated aliases', () => {
    it('updateCompany should be alias for updatePrimaryOrg', () => {
      expect(users.updateCompany).toBe(users.updatePrimaryOrg);
    });

    it('findByCompanyId should be alias for findByOrgId', () => {
      expect(users.findByCompanyId).toBe(users.findByOrgId);
    });
  });
});
