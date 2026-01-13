import { Test, TestingModule } from '@nestjs/testing';
import { SessionHistoryService } from './session-history.service';
import { Session, SessionChangeType, StructurePrediction } from '../interfaces';

describe('SessionHistoryService', () => {
  let service: SessionHistoryService;

  const createMockSession = (overrides: Partial<Session> = {}): Session => {
    const now = new Date();
    return {
      id: 'test-session-1',
      company: 'test-company',
      project: 'test-project',
      user: 'test-user',
      context: [],
      messages: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'active',
      originalSignal: 'test signal',
      currentPrediction: null,
      participants: [],
      ...overrides,
    };
  };

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
      providers: [SessionHistoryService],
    }).compile();

    service = module.get<SessionHistoryService>(SessionHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordVersion', () => {
    it('should record a new version with correct version number', async () => {
      const session = createMockSession();

      const version = await service.recordVersion(session, 'created', ['id', 'company']);

      expect(version).toBeDefined();
      expect(version.sessionId).toBe(session.id);
      expect(version.version).toBe(1);
      expect(version.changeType).toBe('created');
      expect(version.changedFields).toEqual(['id', 'company']);
      expect(version.snapshot).toBeDefined();
      expect(version.snapshot.id).toBe(session.id);
    });

    it('should increment version number for subsequent recordings', async () => {
      const session = createMockSession();

      const version1 = await service.recordVersion(session, 'created', ['id']);
      const version2 = await service.recordVersion(session, 'updated', ['status']);
      const version3 = await service.recordVersion(session, 'message_added', ['messages']);

      expect(version1.version).toBe(1);
      expect(version2.version).toBe(2);
      expect(version3.version).toBe(3);
    });

    it('should record different change types correctly', async () => {
      const session = createMockSession();

      const changeTypes: SessionChangeType[] = ['created', 'updated', 'message_added', 'context_changed'];

      for (let i = 0; i < changeTypes.length; i++) {
        const version = await service.recordVersion(session, changeTypes[i], ['field']);
        expect(version.changeType).toBe(changeTypes[i]);
      }
    });

    it('should create independent snapshots for each version', async () => {
      const session = createMockSession({ status: 'active' });

      const version1 = await service.recordVersion(session, 'created', ['status']);

      session.status = 'archived';
      const version2 = await service.recordVersion(session, 'updated', ['status']);

      expect(version1.snapshot.status).toBe('active');
      expect(version2.snapshot.status).toBe('archived');
    });
  });

  describe('getHistory', () => {
    it('should return empty history for session with no versions', async () => {
      const history = await service.getHistory('non-existent-session');

      expect(history.sessionId).toBe('non-existent-session');
      expect(history.versions).toHaveLength(0);
      expect(history.totalVersions).toBe(0);
      expect(history.currentVersion).toBe(0);
    });

    it('should return all versions in descending order', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'updated', ['status']);
      await service.recordVersion(session, 'message_added', ['messages']);

      const history = await service.getHistory(session.id);

      expect(history.versions).toHaveLength(3);
      expect(history.versions[0].version).toBe(3);
      expect(history.versions[1].version).toBe(2);
      expect(history.versions[2].version).toBe(1);
      expect(history.totalVersions).toBe(3);
      expect(history.currentVersion).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'updated', ['status']);
      await service.recordVersion(session, 'message_added', ['messages']);

      const history = await service.getHistory(session.id, 2);

      expect(history.versions).toHaveLength(2);
      expect(history.totalVersions).toBe(3);
    });
  });

  describe('getVersion', () => {
    it('should return specific version by number', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'updated', ['status']);

      const version = await service.getVersion(session.id, 1);

      expect(version).toBeDefined();
      expect(version?.version).toBe(1);
      expect(version?.changeType).toBe('created');
    });

    it('should return null for non-existent version', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);

      const version = await service.getVersion(session.id, 999);

      expect(version).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const version = await service.getVersion('non-existent', 1);

      expect(version).toBeNull();
    });
  });

  describe('rollback', () => {
    it('should rollback session to previous version', async () => {
      const session = createMockSession({ status: 'active', participants: ['user1'] });

      await service.recordVersion(session, 'created', ['status', 'participants']);

      session.status = 'archived';
      session.participants = ['user1', 'user2'];
      await service.recordVersion(session, 'updated', ['status', 'participants']);

      const mockUpdateCallback = jest.fn().mockImplementation(async (restoredSession: Session) => {
        return restoredSession;
      });

      const result = await service.rollback(session.id, 1, mockUpdateCallback);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.rolledBackToVersion).toBe(1);
      expect(result?.newVersion).toBe(3);
      expect(mockUpdateCallback).toHaveBeenCalled();
    });

    it('should return null when target version does not exist', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);

      const mockUpdateCallback = jest.fn();
      const result = await service.rollback(session.id, 999, mockUpdateCallback);

      expect(result).toBeNull();
      expect(mockUpdateCallback).not.toHaveBeenCalled();
    });

    it('should return null when update callback fails', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);

      const mockUpdateCallback = jest.fn().mockResolvedValue(null);
      const result = await service.rollback(session.id, 1, mockUpdateCallback);

      expect(result).toBeNull();
    });
  });

  describe('diff', () => {
    it('should return diff between two versions', async () => {
      const session = createMockSession({ status: 'active', participants: [] });

      await service.recordVersion(session, 'created', ['status']);

      session.status = 'archived';
      session.participants = ['user1'];
      await service.recordVersion(session, 'updated', ['status', 'participants']);

      const diff = await service.diff(session.id, 1, 2);

      expect(diff).toBeDefined();
      expect(diff?.sessionId).toBe(session.id);
      expect(diff?.fromVersion).toBe(1);
      expect(diff?.toVersion).toBe(2);
      expect(diff?.changedFields).toContain('status');
      expect(diff?.changedFields).toContain('participants');
    });

    it('should return empty changes when versions are identical', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'created', ['id']);

      const diff = await service.diff(session.id, 1, 2);

      expect(diff).toBeDefined();
      expect(diff?.changedFields).toHaveLength(0);
      expect(diff?.changes).toHaveLength(0);
    });

    it('should return null when version does not exist', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);

      const diff = await service.diff(session.id, 1, 999);

      expect(diff).toBeNull();
    });

    it('should detect changes in nested objects like currentPrediction', async () => {
      const session = createMockSession({ currentPrediction: null });

      await service.recordVersion(session, 'created', ['currentPrediction']);

      session.currentPrediction = mockPrediction;
      await service.recordVersion(session, 'updated', ['currentPrediction']);

      const diff = await service.diff(session.id, 1, 2);

      expect(diff).toBeDefined();
      expect(diff?.changedFields).toContain('currentPrediction');
      expect(diff?.changes.find(c => c.field === 'currentPrediction')).toBeDefined();
    });
  });

  describe('pruneHistory', () => {
    it('should keep only last 10 versions', async () => {
      const session = createMockSession();

      for (let i = 0; i < 15; i++) {
        await service.recordVersion(session, 'updated', ['status']);
      }

      const history = await service.getHistory(session.id);

      expect(history.versions.length).toBeLessThanOrEqual(10);
      expect(history.versions[0].version).toBe(15);
    });

    it('should not prune when under limit', async () => {
      const session = createMockSession();

      for (let i = 0; i < 5; i++) {
        await service.recordVersion(session, 'updated', ['status']);
      }

      const prunedCount = await service.pruneHistory(session.id);

      expect(prunedCount).toBe(0);

      const history = await service.getHistory(session.id);
      expect(history.versions).toHaveLength(5);
    });

    it('should return count of pruned versions', async () => {
      const session = createMockSession();

      for (let i = 0; i < 12; i++) {
        await service.recordVersion(session, 'updated', ['status']);
      }

      const history = await service.getHistory(session.id);
      expect(history.versions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return 0 for session with no versions', () => {
      const currentVersion = service.getCurrentVersion('non-existent');

      expect(currentVersion).toBe(0);
    });

    it('should return highest version number', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'updated', ['status']);
      await service.recordVersion(session, 'message_added', ['messages']);

      const currentVersion = service.getCurrentVersion(session.id);

      expect(currentVersion).toBe(3);
    });
  });

  describe('deleteHistory', () => {
    it('should delete all history for a session', async () => {
      const session = createMockSession();

      await service.recordVersion(session, 'created', ['id']);
      await service.recordVersion(session, 'updated', ['status']);

      const deleted = await service.deleteHistory(session.id);

      expect(deleted).toBe(true);

      const history = await service.getHistory(session.id);
      expect(history.versions).toHaveLength(0);
    });

    it('should return true for non-existent session', async () => {
      const deleted = await service.deleteHistory('non-existent');

      expect(deleted).toBe(true);
    });
  });

  describe('snapshot isolation', () => {
    it('should not affect original session when modifying snapshot', async () => {
      const session = createMockSession({ participants: ['user1'] });

      const version = await service.recordVersion(session, 'created', ['participants']);

      version.snapshot.participants.push('user2');

      const retrievedVersion = await service.getVersion(session.id, 1);
      expect(retrievedVersion?.snapshot.participants).toEqual(['user1']);
    });

    it('should preserve message timestamps as Date objects', async () => {
      const now = new Date();
      const session = createMockSession({
        messages: [
          {
            turn: 1,
            timestamp: now,
            input: 'test input',
            inputType: 'signal',
            prediction: null,
            confidence: 0.8,
          },
        ],
      });

      const version = await service.recordVersion(session, 'message_added', ['messages']);

      expect(version.snapshot.messages[0].timestamp).toBeInstanceOf(Date);
    });
  });
});
