import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { StructurePrediction } from '../interfaces';

describe('SessionService', () => {
  let service: SessionService;

  const mockPrediction: StructurePrediction = {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [
          { name: 'Assessor', type: 'user', required: true },
          { name: 'Date', type: 'date', required: true },
        ],
        order: 0,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('session creation', () => {
    it('should create a new session with getOrCreate', () => {
      const sessionId = 'test-session-1';
      const originalSignal = 'create a safety assessment form';
      const company = 'test-company';

      const session = service.getOrCreate(sessionId, originalSignal, company);

      expect(session).toBeDefined();
      expect(session.id).toBe(sessionId);
      expect(session.originalSignal).toBe(originalSignal);
      expect(session.company).toBe(company);
      expect(session.status).toBe('active');
      expect(session.messages).toHaveLength(0);
      expect(session.context).toHaveLength(0);
      expect(session.participants).toHaveLength(0);
    });

    it('should return existing session on subsequent getOrCreate calls', () => {
      const sessionId = 'test-session-2';
      const originalSignal = 'create an incident report';

      const session1 = service.getOrCreate(sessionId, originalSignal);
      const session2 = service.getOrCreate(sessionId, 'different signal');

      expect(session1).toBe(session2);
      expect(session2.originalSignal).toBe(originalSignal);
    });

    it('should create session with async create method', async () => {
      const session = await service.create({
        company: 'acme-corp',
        project: 'safety-project',
        user: 'user-123',
        originalSignal: 'create a permit form',
      });

      expect(session).toBeDefined();
      expect(session.company).toBe('acme-corp');
      expect(session.project).toBe('safety-project');
      expect(session.user).toBe('user-123');
      expect(session.status).toBe('active');
      expect(session.expiresAt).toBeDefined();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should set default TTL of 24 hours', async () => {
      const session = await service.create({
        company: 'test-company',
      });

      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      const actualExpiry = session.expiresAt.getTime();

      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 1000);
    });

    it('should allow custom TTL', async () => {
      const customTTL = 1 * 60 * 60 * 1000; // 1 hour
      const session = await service.create({
        company: 'test-company',
        ttlMs: customTTL,
      });

      const expectedExpiry = Date.now() + customTTL;
      const actualExpiry = session.expiresAt.getTime();

      expect(actualExpiry).toBeGreaterThan(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThan(expectedExpiry + 1000);
    });
  });

  describe('session retrieval', () => {
    it('should get session by id', () => {
      const sessionId = 'test-session-get';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      const session = service.get(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('should return null for non-existent session', () => {
      const session = service.get('non-existent-session');

      expect(session).toBeNull();
    });

    it('should get session asynchronously', async () => {
      const sessionId = 'test-session-async';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      const session = await service.getAsync(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });
  });

  describe('session update', () => {
    it('should update session fields', () => {
      const sessionId = 'test-session-update';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      const updatedSession = service.update(sessionId, {
        currentPrediction: mockPrediction,
        participants: ['analyst', 'reviewer'],
      });

      expect(updatedSession).toBeDefined();
      expect(updatedSession?.currentPrediction).toBe(mockPrediction);
      expect(updatedSession?.participants).toEqual(['analyst', 'reviewer']);
      expect(updatedSession?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        updatedSession?.createdAt.getTime() || 0
      );
    });

    it('should return null when updating non-existent session', () => {
      const result = service.update('non-existent', { participants: ['test'] });

      expect(result).toBeNull();
    });

    it('should update context signals', () => {
      const sessionId = 'test-session-context';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      const contextSignals = [
        { type: 'domain', value: 'hse', source: 'user', timestamp: new Date() },
        { type: 'priority', value: 'high', source: 'system', timestamp: new Date() },
      ];

      const updatedSession = service.update(sessionId, { context: contextSignals });

      expect(updatedSession?.context).toHaveLength(2);
      expect(updatedSession?.context[0].type).toBe('domain');
    });
  });

  describe('session deletion', () => {
    it('should delete session', () => {
      const sessionId = 'test-session-delete';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      const deleted = service.delete(sessionId);

      expect(deleted).toBe(true);
      expect(service.get(sessionId)).toBeNull();
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = service.delete('non-existent-session');

      expect(deleted).toBe(false);
    });
  });

  describe('session listing', () => {
    beforeEach(async () => {
      await service.create({ company: 'company-a', project: 'project-1', user: 'user-1' });
      await service.create({ company: 'company-a', project: 'project-2', user: 'user-2' });
      await service.create({ company: 'company-b', project: 'project-1', user: 'user-1' });
    });

    it('should list all sessions', async () => {
      const sessions = await service.list({});

      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter sessions by company', async () => {
      const sessions = await service.list({ company: 'company-a' });

      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.company).toBe('company-a'));
    });

    it('should filter sessions by project', async () => {
      const sessions = await service.list({ project: 'project-1' });

      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.project).toBe('project-1'));
    });

    it('should filter sessions by user', async () => {
      const sessions = await service.list({ user: 'user-1' });

      expect(sessions.length).toBe(2);
      sessions.forEach(s => expect(s.user).toBe('user-1'));
    });

    it('should limit results', async () => {
      const sessions = await service.list({ limit: 2 });

      expect(sessions.length).toBe(2);
    });

    it('should filter by status', async () => {
      const sessions = await service.list({ status: 'active' });

      sessions.forEach(s => expect(s.status).toBe('active'));
    });
  });

  describe('recording predictions', () => {
    it('should record prediction in session history', () => {
      const sessionId = 'test-session-record';
      service.getOrCreate(sessionId, 'create a safety form', 'test-company');

      service.recordPrediction(
        sessionId,
        'create a safety form',
        'signal',
        mockPrediction,
        0.85,
        'analyst'
      );

      const session = service.get(sessionId);
      expect(session?.messages).toHaveLength(1);
      expect(session?.messages[0].input).toBe('create a safety form');
      expect(session?.messages[0].inputType).toBe('signal');
      expect(session?.messages[0].confidence).toBe(0.85);
      expect(session?.messages[0].participant).toBe('analyst');
      expect(session?.currentPrediction).toBe(mockPrediction);
    });

    it('should add participant when recording prediction', () => {
      const sessionId = 'test-session-participant';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.recordPrediction(sessionId, 'input', 'signal', mockPrediction, 0.8, 'reviewer');

      const session = service.get(sessionId);
      expect(session?.participants).toContain('reviewer');
    });

    it('should enforce max 100 messages limit', () => {
      const sessionId = 'test-session-max-messages';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      for (let i = 0; i < 105; i++) {
        service.recordPrediction(
          sessionId,
          `input-${i}`,
          'refinement',
          mockPrediction,
          0.8
        );
      }

      const session = service.get(sessionId);
      expect(session?.messages.length).toBeLessThanOrEqual(100);
    });

    it('should increment turn number for each prediction', () => {
      const sessionId = 'test-session-turns';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.recordPrediction(sessionId, 'input-1', 'signal', mockPrediction, 0.8);
      service.recordPrediction(sessionId, 'input-2', 'refinement', mockPrediction, 0.85);
      service.recordPrediction(sessionId, 'input-3', 'refinement', mockPrediction, 0.9);

      const session = service.get(sessionId);
      expect(session?.messages[0].turn).toBe(1);
      expect(session?.messages[1].turn).toBe(2);
      expect(session?.messages[2].turn).toBe(3);
    });
  });

  describe('context management', () => {
    it('should add context signals', () => {
      const sessionId = 'test-session-add-context';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.addContext(sessionId, { type: 'domain', value: 'hse', source: 'user', timestamp: new Date() });

      const session = service.get(sessionId);
      expect(session?.context).toHaveLength(1);
      expect(session?.context[0].type).toBe('domain');
    });

    it('should get accumulated context', () => {
      const sessionId = 'test-session-accumulated';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.addContext(sessionId, { type: 'domain', value: 'hse', source: 'user', timestamp: new Date() });
      service.addContext(sessionId, { type: 'priority', value: 'high', source: 'system', timestamp: new Date() });

      const context = service.getAccumulatedContext(sessionId);
      expect(context).toHaveLength(2);
    });

    it('should return empty array for non-existent session context', () => {
      const context = service.getAccumulatedContext('non-existent');
      expect(context).toEqual([]);
    });
  });

  describe('session summary', () => {
    it('should get session summary', () => {
      const sessionId = 'test-session-summary';
      service.getOrCreate(sessionId, 'create a safety form', 'test-company');
      service.recordPrediction(sessionId, 'input', 'signal', mockPrediction, 0.85, 'analyst');

      const summary = service.getSummary(sessionId);

      expect(summary).toBeDefined();
      expect(summary?.sessionId).toBe(sessionId);
      expect(summary?.turns).toBe(1);
      expect(summary?.participants).toContain('analyst');
      expect(summary?.hasCurrentPrediction).toBe(true);
    });

    it('should return null for non-existent session summary', () => {
      const summary = service.getSummary('non-existent');
      expect(summary).toBeNull();
    });
  });

  describe('session expiration', () => {
    it('should expire sessions past TTL', async () => {
      const session = await service.create({
        company: 'test-company',
        ttlMs: -1000,
      });

      const result = await service.expireSessions();

      expect(result.expiredCount).toBeGreaterThanOrEqual(1);
      expect(result.expiredIds).toContain(session.id);
    });

    it('should return cleanup result with counts', async () => {
      const result = await service.expireSessions();

      expect(result).toBeDefined();
      expect(typeof result.expiredCount).toBe('number');
      expect(typeof result.archivedCount).toBe('number');
      expect(Array.isArray(result.expiredIds)).toBe(true);
      expect(Array.isArray(result.archivedIds)).toBe(true);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('combined signal', () => {
    it('should combine original signal with refinements', () => {
      const sessionId = 'test-session-combined';
      service.getOrCreate(sessionId, 'create a safety form', 'test-company');
      service.recordPrediction(sessionId, 'add a risk section', 'refinement', mockPrediction, 0.8);

      const combined = service.getCombinedSignal(sessionId);

      expect(combined).toContain('create a safety form');
      expect(combined).toContain('add a risk section');
    });

    it('should return empty string for non-existent session', () => {
      const combined = service.getCombinedSignal('non-existent');
      expect(combined).toBe('');
    });
  });

  describe('active session count', () => {
    it('should return count of active sessions', async () => {
      await service.create({ company: 'company-count-1' });
      await service.create({ company: 'company-count-2' });

      const count = service.getActiveSessionCount();

      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('participant management', () => {
    it('should add participant to session', () => {
      const sessionId = 'test-session-add-participant';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.addParticipant(sessionId, 'analyst');
      service.addParticipant(sessionId, 'reviewer');

      const session = service.get(sessionId);
      expect(session?.participants).toContain('analyst');
      expect(session?.participants).toContain('reviewer');
    });

    it('should not add duplicate participants', () => {
      const sessionId = 'test-session-dup-participant';
      service.getOrCreate(sessionId, 'test signal', 'test-company');

      service.addParticipant(sessionId, 'analyst');
      service.addParticipant(sessionId, 'analyst');

      const session = service.get(sessionId);
      const analystCount = session?.participants.filter(p => p === 'analyst').length;
      expect(analystCount).toBe(1);
    });
  });
});
