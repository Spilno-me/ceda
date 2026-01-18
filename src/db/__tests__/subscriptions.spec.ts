/**
 * Tests for CEDA Subscriptions Repository
 * CEDA-99: DB Layer Test Coverage
 *
 * Edge cases covered:
 * - Duplicate Stripe webhook events (idempotency via stripe_events table)
 * - Transaction handling for webhook processing
 */

import * as subscriptions from '../subscriptions';
import * as db from '../index';
import * as orgs from '../orgs';

jest.mock('../index');
jest.mock('../orgs');

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockTransaction = db.transaction as jest.MockedFunction<typeof db.transaction>;
const mockOrgsFindBySlug = orgs.findBySlug as jest.MockedFunction<typeof orgs.findBySlug>;

describe('Subscriptions Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSubscription: subscriptions.DbSubscription = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    stripe_subscription_id: 'sub_test123',
    stripe_customer_id: 'cus_test123',
    org_id: '660e8400-e29b-41d4-a716-446655440001',
    status: 'active',
    plan: 'pro',
    current_period_start: new Date('2024-01-01'),
    current_period_end: new Date('2024-02-01'),
    canceled_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockOrg = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    slug: 'test-org',
    stripe_customer_id: 'cus_test123',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  describe('isEventProcessed', () => {
    it('should return true when event has been processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'evt_test123' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.isEventProcessed('evt_test123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM stripe_events WHERE id = $1',
        ['evt_test123']
      );
    });

    it('should return false when event has not been processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.isEventProcessed('evt_new123');

      expect(result).toBe(false);
    });

    it('should handle duplicate event check (idempotency edge case)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'evt_duplicate' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.isEventProcessed('evt_duplicate');

      expect(result).toBe(true);
    });
  });

  describe('markEventProcessed', () => {
    it('should mark event as processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await subscriptions.markEventProcessed('evt_test123', 'customer.subscription.created');

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        ['evt_test123', 'customer.subscription.created']
      );
    });

    it('should handle duplicate insert gracefully (ON CONFLICT DO NOTHING)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      await subscriptions.markEventProcessed('evt_duplicate', 'customer.subscription.updated');

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return subscription when found by internal ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findById(mockSubscription.id);

      expect(result).toEqual(mockSubscription);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM subscriptions WHERE id = $1',
        [mockSubscription.id]
      );
    });

    it('should return null when subscription not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByStripeId', () => {
    it('should return subscription when found by Stripe subscription ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByStripeId('sub_test123');

      expect(result).toEqual(mockSubscription);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
        ['sub_test123']
      );
    });

    it('should return null when Stripe subscription ID not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByStripeId('sub_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByCompanyId', () => {
    it('should return active subscription for company', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByCompanyId(mockOrg.id);

      expect(result).toEqual(mockSubscription);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('active', 'trialing', 'past_due')"),
        [mockOrg.id]
      );
    });

    it('should return null when company has no active subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByCompanyId('company-without-sub');

      expect(result).toBeNull();
    });

    it('should return most recent subscription when multiple exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await subscriptions.findByCompanyId(mockOrg.id);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('findByCompanySlug', () => {
    it('should return subscription when company found by slug', async () => {
      mockOrgsFindBySlug.mockResolvedValueOnce(mockOrg);
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByCompanySlug('test-org');

      expect(result).toEqual(mockSubscription);
      expect(mockOrgsFindBySlug).toHaveBeenCalledWith('test-org');
    });

    it('should return null when company slug not found', async () => {
      mockOrgsFindBySlug.mockResolvedValueOnce(null);

      const result = await subscriptions.findByCompanySlug('non-existent-org');

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return subscription when found by Stripe customer ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.findByStripeCustomerId('cus_test123');

      expect(result).toEqual(mockSubscription);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('active', 'trialing', 'past_due')"),
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

      const result = await subscriptions.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsertFromStripe', () => {
    it('should update existing subscription', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [mockSubscription],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ ...mockSubscription, status: 'past_due' }],
          command: 'UPDATE',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await subscriptions.upsertFromStripe(
        'sub_test123',
        'cus_test123',
        mockOrg.id,
        'past_due',
        'pro'
      );

      expect(result.status).toBe('past_due');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should create new subscription when not exists', async () => {
      const newSubscription = { ...mockSubscription, id: 'new-sub-id' };
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [newSubscription],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const result = await subscriptions.upsertFromStripe(
        'sub_new123',
        'cus_test123',
        mockOrg.id,
        'active',
        'pro',
        new Date('2024-01-01'),
        new Date('2024-02-01')
      );

      expect(result).toEqual(newSubscription);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO subscriptions'),
        expect.any(Array)
      );
    });

    it('should handle optional period dates', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [mockSubscription],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await subscriptions.upsertFromStripe(
        'sub_new123',
        'cus_test123',
        mockOrg.id,
        'active',
        'pro'
      );

      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO subscriptions'),
        expect.arrayContaining([null, null])
      );
    });
  });

  describe('cancel', () => {
    it('should cancel subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await subscriptions.cancel('sub_test123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'canceled'"),
        ['sub_test123']
      );
    });
  });

  describe('updateStatus', () => {
    it('should update subscription status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await subscriptions.updateStatus('sub_test123', 'past_due');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2',
        ['past_due', 'sub_test123']
      );
    });

    it('should handle all subscription statuses', async () => {
      const statuses: subscriptions.SubscriptionStatus[] = [
        'active',
        'canceled',
        'past_due',
        'unpaid',
        'trialing',
        'incomplete',
        'incomplete_expired',
      ];

      for (const status of statuses) {
        mockQuery.mockResolvedValueOnce({
          rows: [],
          command: 'UPDATE',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

        await subscriptions.updateStatus('sub_test123', status);

        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.any(String),
          [status, 'sub_test123']
        );
      }
    });
  });

  describe('processWebhookEvent', () => {
    const mockClient = {
      query: jest.fn(),
    };

    beforeEach(() => {
      mockTransaction.mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });
    });

    it('should process new webhook event', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const handler = jest.fn().mockResolvedValue({ success: true });

      const result = await subscriptions.processWebhookEvent(
        'evt_new123',
        'customer.subscription.created',
        handler
      );

      expect(result.processed).toBe(true);
      expect(result.result).toEqual({ success: true });
      expect(handler).toHaveBeenCalled();
    });

    it('should skip already processed event (idempotency)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'evt_duplicate' }],
      });

      const handler = jest.fn();

      const result = await subscriptions.processWebhookEvent(
        'evt_duplicate',
        'customer.subscription.updated',
        handler
      );

      expect(result.processed).toBe(false);
      expect(result.result).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should mark event as processed before running handler', async () => {
      const callOrder: string[] = [];

      mockClient.query
        .mockImplementationOnce(() => {
          callOrder.push('check');
          return Promise.resolve({ rows: [] });
        })
        .mockImplementationOnce(() => {
          callOrder.push('mark');
          return Promise.resolve({ rows: [] });
        });

      const handler = jest.fn().mockImplementation(() => {
        callOrder.push('handler');
        return Promise.resolve({ success: true });
      });

      await subscriptions.processWebhookEvent(
        'evt_test123',
        'customer.subscription.created',
        handler
      );

      expect(callOrder).toEqual(['check', 'mark', 'handler']);
    });

    it('should handle duplicate webhook events from Stripe (edge case)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'evt_stripe_retry' }],
      });

      const handler = jest.fn();

      const result1 = await subscriptions.processWebhookEvent(
        'evt_stripe_retry',
        'customer.subscription.created',
        handler
      );

      expect(result1.processed).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('hasActiveSubscription', () => {
    it('should return true when company has active subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.hasActiveSubscription(mockOrg.id);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('active', 'trialing')"),
        [mockOrg.id]
      );
    });

    it('should return false when company has no active subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.hasActiveSubscription('company-without-sub');

      expect(result).toBe(false);
    });
  });

  describe('getCompanyPlan', () => {
    it('should return plan when company has subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockSubscription],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.getCompanyPlan(mockOrg.id);

      expect(result).toBe('pro');
    });

    it('should return "free" when company has no subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.getCompanyPlan('company-without-sub');

      expect(result).toBe('free');
    });
  });

  describe('getStats', () => {
    it('should return subscription statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'active', count: '10' },
          { status: 'trialing', count: '5' },
          { status: 'canceled', count: '3' },
          { status: 'past_due', count: '2' },
          { status: 'unpaid', count: '1' },
        ],
        command: 'SELECT',
        rowCount: 5,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.getStats();

      expect(result).toEqual({
        total: 21,
        active: 15,
        canceled: 3,
        pastDue: 3,
      });
    });

    it('should return zeros when no subscriptions exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await subscriptions.getStats();

      expect(result).toEqual({
        total: 0,
        active: 0,
        canceled: 0,
        pastDue: 0,
      });
    });
  });

  describe('SubscriptionStatus type', () => {
    it('should include all valid statuses', () => {
      const validStatuses: subscriptions.SubscriptionStatus[] = [
        'active',
        'canceled',
        'past_due',
        'unpaid',
        'trialing',
        'incomplete',
        'incomplete_expired',
      ];

      expect(validStatuses).toHaveLength(7);
    });
  });
});
