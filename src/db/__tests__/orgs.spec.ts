/**
 * Tests for CEDA Orgs Repository
 * CEDA-99: DB Layer Test Coverage
 */

import * as orgs from '../orgs';
import * as db from '../index';

jest.mock('../index');

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('Orgs Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOrg: orgs.DbOrg = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Organization',
    slug: 'test-org',
    stripe_customer_id: 'cus_test123',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  describe('findById', () => {
    it('should return org when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockOrg],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findById(mockOrg.id);

      expect(result).toEqual(mockOrg);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs WHERE id = $1',
        [mockOrg.id]
      );
    });

    it('should return null when org not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle invalid UUID format gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findById('anonymous');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs WHERE id = $1',
        ['anonymous']
      );
    });
  });

  describe('findBySlug', () => {
    it('should return org when found by slug', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockOrg],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findBySlug('test-org');

      expect(result).toEqual(mockOrg);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs WHERE slug = $1',
        ['test-org']
      );
    });

    it('should return null when slug not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findBySlug('non-existent-slug');

      expect(result).toBeNull();
    });

    it('should handle empty slug', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findBySlug('');

      expect(result).toBeNull();
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return org when found by Stripe customer ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockOrg],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findByStripeCustomerId('cus_test123');

      expect(result).toEqual(mockOrg);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs WHERE stripe_customer_id = $1',
        ['cus_test123']
      );
    });

    it('should return null when Stripe customer ID not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsertBySlug', () => {
    it('should return existing org when slug already exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockOrg],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.upsertBySlug('test-org');

      expect(result).toEqual({ org: mockOrg, isNew: false });
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should create new org when slug does not exist', async () => {
      const newOrg: orgs.DbOrg = {
        ...mockOrg,
        id: '660e8400-e29b-41d4-a716-446655440001',
        slug: 'new-org',
        name: 'new-org',
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [newOrg],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await orgs.upsertBySlug('new-org');

      expect(result).toEqual({ org: newOrg, isNew: true });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should use provided name when creating new org', async () => {
      const newOrg: orgs.DbOrg = {
        ...mockOrg,
        id: '770e8400-e29b-41d4-a716-446655440002',
        slug: 'new-org',
        name: 'Custom Name',
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [newOrg],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await orgs.upsertBySlug('new-org', 'Custom Name');

      expect(result.org.name).toBe('Custom Name');
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO orgs'),
        ['Custom Name', 'new-org']
      );
    });

    it('should use slug as name when name not provided', async () => {
      const newOrg: orgs.DbOrg = {
        ...mockOrg,
        id: '880e8400-e29b-41d4-a716-446655440003',
        slug: 'slug-as-name',
        name: 'slug-as-name',
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [newOrg],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await orgs.upsertBySlug('slug-as-name');

      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO orgs'),
        ['slug-as-name', 'slug-as-name']
      );
    });
  });

  describe('setStripeCustomerId', () => {
    it('should update Stripe customer ID for org', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await orgs.setStripeCustomerId(mockOrg.id, 'cus_new123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orgs SET stripe_customer_id'),
        ['cus_new123', mockOrg.id]
      );
    });
  });

  describe('updateName', () => {
    it('should update org name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await orgs.updateName(mockOrg.id, 'New Name');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orgs SET name'),
        ['New Name', mockOrg.id]
      );
    });
  });

  describe('listAll', () => {
    it('should return all orgs with default limit', async () => {
      const orgsList = [mockOrg, { ...mockOrg, id: 'another-id', slug: 'another-org' }];
      mockQuery.mockResolvedValueOnce({
        rows: orgsList,
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      const result = await orgs.listAll();

      expect(result).toEqual(orgsList);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs ORDER BY created_at DESC LIMIT $1',
        [100]
      );
    });

    it('should respect custom limit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockOrg],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await orgs.listAll(10);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM orgs ORDER BY created_at DESC LIMIT $1',
        [10]
      );
    });

    it('should return empty array when no orgs exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await orgs.listAll();

      expect(result).toEqual([]);
    });
  });

  describe('count', () => {
    it('should return total count of orgs', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '42' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.count();

      expect(result).toBe(42);
      expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM orgs');
    });

    it('should return 0 when no orgs exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await orgs.count();

      expect(result).toBe(0);
    });
  });

  describe('DbCompany type alias', () => {
    it('should be compatible with DbOrg', () => {
      const company: orgs.DbCompany = mockOrg;
      expect(company.id).toBe(mockOrg.id);
    });
  });
});
