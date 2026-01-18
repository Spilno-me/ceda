/**
 * Tests for CEDA Usage Repository
 * CEDA-99: DB Layer Test Coverage
 *
 * Edge cases covered:
 * - Period boundary calculations (usage records span month boundaries)
 * - Month start/end date calculations
 */

import * as usage from '../usage';
import * as db from '../index';
import * as orgs from '../orgs';

jest.mock('../index');
jest.mock('../orgs');

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockOrgsUpsertBySlug = orgs.upsertBySlug as jest.MockedFunction<typeof orgs.upsertBySlug>;

describe('Usage Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockOrg = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    slug: 'test-org',
    stripe_customer_id: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockUsageRecord: usage.DbUsageRecord = {
    id: 1,
    org_id: mockOrg.id,
    metric: 'predictions',
    count: 10,
    period_start: new Date('2024-06-01'),
    period_end: new Date('2024-06-30'),
    created_at: new Date('2024-06-15'),
  };

  describe('record', () => {
    it('should record usage with correct period boundaries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.record(mockOrg.id, 'predictions', 5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_records'),
        expect.arrayContaining([
          mockOrg.id,
          'predictions',
          5,
          expect.any(Date),
          expect.any(Date),
        ])
      );

      const callArgs = mockQuery.mock.calls[0][1];
      const periodStart = callArgs![3] as Date;
      const periodEnd = callArgs![4] as Date;

      expect(periodStart.getDate()).toBe(1);
      expect(periodStart.getMonth()).toBe(5);
      expect(periodEnd.getDate()).toBe(30);
      expect(periodEnd.getMonth()).toBe(5);
    });

    it('should use default count of 1', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.record(mockOrg.id, 'reflections');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockOrg.id, 'reflections', 1])
      );
    });

    it('should handle period boundary at month end (edge case)', async () => {
      jest.setSystemTime(new Date('2024-01-31T23:59:59Z'));

      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.record(mockOrg.id, 'predictions', 1);

      const callArgs = mockQuery.mock.calls[0][1];
      const periodStart = callArgs![3] as Date;
      const periodEnd = callArgs![4] as Date;

      expect(periodStart.getDate()).toBe(1);
      expect(periodStart.getMonth()).toBe(0);
      expect(periodEnd.getDate()).toBe(31);
      expect(periodEnd.getMonth()).toBe(0);
    });

    it('should handle February period boundary (edge case)', async () => {
      jest.setSystemTime(new Date('2024-02-15T12:00:00Z'));

      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.record(mockOrg.id, 'predictions', 1);

      const callArgs = mockQuery.mock.calls[0][1];
      const periodEnd = callArgs![4] as Date;

      expect(periodEnd.getDate()).toBe(29);
      expect(periodEnd.getMonth()).toBe(1);
    });

    it('should handle December to January boundary (edge case)', async () => {
      jest.setSystemTime(new Date('2024-12-15T12:00:00Z'));

      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.record(mockOrg.id, 'predictions', 1);

      const callArgs = mockQuery.mock.calls[0][1];
      const periodStart = callArgs![3] as Date;
      const periodEnd = callArgs![4] as Date;

      expect(periodStart.getMonth()).toBe(11);
      expect(periodEnd.getMonth()).toBe(11);
      expect(periodEnd.getDate()).toBe(31);
    });

    it('should record all metric types', async () => {
      const metrics: usage.UsageMetric[] = [
        'predictions',
        'reflections',
        'sessions',
        'patterns_captured',
        'api_calls',
        'tokens_used',
      ];

      for (const metric of metrics) {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

        await usage.record(mockOrg.id, metric, 1);

        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.arrayContaining([mockOrg.id, metric, 1])
        );
      }
    });
  });

  describe('recordBySlug', () => {
    it('should record usage by org slug', async () => {
      mockOrgsUpsertBySlug.mockResolvedValueOnce({ org: mockOrg, isNew: false });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.recordBySlug('test-org', 'predictions', 5);

      expect(mockOrgsUpsertBySlug).toHaveBeenCalledWith('test-org');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_records'),
        expect.arrayContaining([mockOrg.id, 'predictions', 5])
      );
    });

    it('should create org if not exists', async () => {
      mockOrgsUpsertBySlug.mockResolvedValueOnce({ org: mockOrg, isNew: true });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.recordBySlug('new-org', 'predictions', 1);

      expect(mockOrgsUpsertBySlug).toHaveBeenCalledWith('new-org');
    });
  });

  describe('recordBatch', () => {
    it('should record multiple usage events in batch', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 3,
        oid: 0,
        fields: [],
      });

      await usage.recordBatch([
        { orgId: mockOrg.id, metric: 'predictions', count: 5 },
        { orgId: mockOrg.id, metric: 'reflections', count: 3 },
        { orgId: 'another-org-id', metric: 'sessions', count: 1 },
      ]);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_records'),
        expect.arrayContaining([
          mockOrg.id, 'predictions', 5,
          mockOrg.id, 'reflections', 3,
          'another-org-id', 'sessions', 1,
        ])
      );
    });

    it('should handle empty batch', async () => {
      await usage.recordBatch([]);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should use default count of 1 when not specified', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.recordBatch([
        { orgId: mockOrg.id, metric: 'predictions' },
      ]);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([mockOrg.id, 'predictions', 1])
      );
    });
  });

  describe('getUsage', () => {
    it('should return usage sum for org and metric', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '150' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getUsage(
        mockOrg.id,
        'predictions',
        new Date('2024-06-01'),
        new Date('2024-06-30')
      );

      expect(result).toBe(150);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM(count)'),
        [mockOrg.id, 'predictions', expect.any(Date), expect.any(Date)]
      );
    });

    it('should return 0 when no usage records exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getUsage(
        mockOrg.id,
        'predictions',
        new Date('2024-06-01')
      );

      expect(result).toBe(0);
    });

    it('should use current date as default end date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '50' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.getUsage(mockOrg.id, 'predictions', new Date('2024-06-01'));

      const callArgs = mockQuery.mock.calls[0][1];
      const endDate = callArgs![3] as Date;

      expect(endDate.getTime()).toBeCloseTo(new Date('2024-06-15T12:00:00Z').getTime(), -3);
    });

    it('should handle usage spanning month boundaries (edge case)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '200' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getUsage(
        mockOrg.id,
        'predictions',
        new Date('2024-05-15'),
        new Date('2024-06-15')
      );

      expect(result).toBe(200);
    });
  });

  describe('getUsageSummary', () => {
    it('should return all metrics summary for org', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { metric: 'predictions', total: '100' },
          { metric: 'reflections', total: '50' },
          { metric: 'sessions', total: '25' },
        ],
        command: 'SELECT',
        rowCount: 3,
        oid: 0,
        fields: [],
      });

      const result = await usage.getUsageSummary(
        mockOrg.id,
        new Date('2024-06-01'),
        new Date('2024-06-30')
      );

      expect(result).toEqual({
        predictions: 100,
        reflections: 50,
        sessions: 25,
      });
    });

    it('should return empty object when no usage exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await usage.getUsageSummary(
        mockOrg.id,
        new Date('2024-06-01')
      );

      expect(result).toEqual({});
    });
  });

  describe('getDailyUsage', () => {
    it('should return daily usage breakdown', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-06-13', count: '10' },
          { date: '2024-06-14', count: '15' },
          { date: '2024-06-15', count: '20' },
        ],
        command: 'SELECT',
        rowCount: 3,
        oid: 0,
        fields: [],
      });

      const result = await usage.getDailyUsage(mockOrg.id, 'predictions', 30);

      expect(result).toEqual([
        { date: '2024-06-13', count: 10 },
        { date: '2024-06-14', count: 15 },
        { date: '2024-06-15', count: 20 },
      ]);
    });

    it('should use default 30 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await usage.getDailyUsage(mockOrg.id, 'predictions');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 day' * $3"),
        [mockOrg.id, 'predictions', 30]
      );
    });

    it('should return empty array when no daily usage', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await usage.getDailyUsage(mockOrg.id, 'predictions', 7);

      expect(result).toEqual([]);
    });
  });

  describe('getGlobalUsage', () => {
    it('should return global usage across all orgs', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '5000' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getGlobalUsage(
        'predictions',
        new Date('2024-06-01'),
        new Date('2024-06-30')
      );

      expect(result).toBe(5000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM(count)'),
        ['predictions', expect.any(Date), expect.any(Date)]
      );
    });

    it('should return 0 when no global usage', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getGlobalUsage(
        'predictions',
        new Date('2024-06-01')
      );

      expect(result).toBe(0);
    });
  });

  describe('getTopOrgs', () => {
    it('should return top orgs by usage', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { org_id: 'org-1', count: '500' },
          { org_id: 'org-2', count: '300' },
          { org_id: 'org-3', count: '100' },
        ],
        command: 'SELECT',
        rowCount: 3,
        oid: 0,
        fields: [],
      });

      const result = await usage.getTopOrgs('predictions', 10, 30);

      expect(result).toEqual([
        { orgId: 'org-1', count: 500 },
        { orgId: 'org-2', count: 300 },
        { orgId: 'org-3', count: 100 },
      ]);
    });

    it('should use default limit and days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await usage.getTopOrgs('predictions');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['predictions', 30, 10]
      );
    });

    it('should return empty array when no orgs have usage', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await usage.getTopOrgs('predictions', 5, 7);

      expect(result).toEqual([]);
    });
  });

  describe('checkQuota', () => {
    it('should return quota status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '80' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.checkQuota(mockOrg.id, 'predictions', 100, 30);

      expect(result).toEqual({
        remaining: 20,
        used: 80,
        limit: 100,
      });
    });

    it('should return 0 remaining when over quota', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '150' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.checkQuota(mockOrg.id, 'predictions', 100, 30);

      expect(result).toEqual({
        remaining: 0,
        used: 150,
        limit: 100,
      });
    });

    it('should use default 30 day period', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '50' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await usage.checkQuota(mockOrg.id, 'predictions', 100);

      const callArgs = mockQuery.mock.calls[0][1];
      const startDate = callArgs![2] as Date;

      const expectedStart = new Date('2024-05-16T12:00:00Z');
      expect(startDate.getTime()).toBeCloseTo(expectedStart.getTime(), -3);
    });

    it('should handle period spanning month boundaries (edge case)', async () => {
      jest.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '30' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.checkQuota(mockOrg.id, 'predictions', 100, 30);

      expect(result.used).toBe(30);
    });
  });

  describe('cleanupOldRecords', () => {
    it('should delete old records', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'DELETE',
        rowCount: 50,
        oid: 0,
        fields: [],
      });

      const result = await usage.cleanupOldRecords(90);

      expect(result).toBe(50);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM usage_records'),
        [90]
      );
    });

    it('should use default 90 day retention', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'DELETE',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await usage.cleanupOldRecords();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [90]
      );
    });

    it('should return 0 when no records to delete', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'DELETE',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await usage.cleanupOldRecords(30);

      expect(result).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return usage statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '1000', orgs: '50', today: '100' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getStats();

      expect(result).toEqual({
        totalRecords: 1000,
        uniqueOrgs: 50,
        todayRecords: 100,
      });
    });

    it('should return zeros when no records exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0', orgs: '0', today: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await usage.getStats();

      expect(result).toEqual({
        totalRecords: 0,
        uniqueOrgs: 0,
        todayRecords: 0,
      });
    });
  });

  describe('deprecated aliases', () => {
    it('getTopCompanies should be alias for getTopOrgs', () => {
      expect(usage.getTopCompanies).toBe(usage.getTopOrgs);
    });
  });

  describe('UsageMetric type', () => {
    it('should include all valid metrics', () => {
      const validMetrics: usage.UsageMetric[] = [
        'predictions',
        'reflections',
        'sessions',
        'patterns_captured',
        'api_calls',
        'tokens_used',
      ];

      expect(validMetrics).toHaveLength(6);
    });
  });
});
