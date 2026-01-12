import { Test, TestingModule } from '@nestjs/testing';
import { AntipatternService } from './antipattern.service';
import {
  Antipattern,
  SessionObservation,
  LearningOutcome,
} from '../interfaces';

describe('AntipatternService', () => {
  let service: AntipatternService;

  const mockAntipatterns: Antipattern[] = [
    {
      id: 'test-antipattern-1',
      signal: 'Repeatedly fixing surface-level issues without addressing root cause',
      context: 'Developer keeps patching symptoms instead of understanding why the underlying issue occurs',
      escape: 'Step back and trace the issue to its origin',
      confidence: 0.85,
      source_sessions: [],
    },
    {
      id: 'test-antipattern-2',
      signal: 'Instructions contain contradictory requirements',
      context: 'User provides requirements that cannot be simultaneously satisfied',
      escape: 'Pause and clarify the conflicting requirements',
      confidence: 0.8,
      source_sessions: [],
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AntipatternService],
    }).compile();

    service = module.get<AntipatternService>(AntipatternService);
  });

  afterEach(() => {
    service.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loadAntipatterns', () => {
    it('should load antipatterns', () => {
      service.loadAntipatterns(mockAntipatterns);
      expect(service.getAntipatternCount()).toBe(2);
    });

    it('should retrieve loaded antipatterns', () => {
      service.loadAntipatterns(mockAntipatterns);
      const antipatterns = service.getAntipatterns();
      expect(antipatterns).toHaveLength(2);
      expect(antipatterns[0].id).toBe('test-antipattern-1');
    });

    it('should get antipattern by ID', () => {
      service.loadAntipatterns(mockAntipatterns);
      const antipattern = service.getAntipattern('test-antipattern-1');
      expect(antipattern).toBeDefined();
      expect(antipattern?.signal).toContain('surface-level issues');
    });

    it('should return undefined for non-existent antipattern', () => {
      service.loadAntipatterns(mockAntipatterns);
      const antipattern = service.getAntipattern('non-existent');
      expect(antipattern).toBeUndefined();
    });
  });

  describe('observe', () => {
    it('should record a session observation', () => {
      const observation: SessionObservation = {
        sessionId: 'session-123',
        timestamp: new Date(),
        behavior: 'User is repeatedly adding try-catch blocks',
        context: 'Debugging a null pointer exception',
      };

      const stored = service.observe(observation);

      expect(stored.id).toBeDefined();
      expect(stored.sessionId).toBe('session-123');
      expect(stored.behavior).toBe('User is repeatedly adding try-catch blocks');
      expect(stored.detectedAntipatterns).toEqual([]);
    });

    it('should retrieve observation by ID', () => {
      const observation: SessionObservation = {
        sessionId: 'session-456',
        timestamp: new Date(),
        behavior: 'Copying code from Stack Overflow',
        context: 'Implementing authentication',
      };

      const stored = service.observe(observation);
      const retrieved = service.getObservation(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe('session-456');
    });

    it('should retrieve observations by session', () => {
      service.observe({
        sessionId: 'session-789',
        timestamp: new Date(),
        behavior: 'First behavior',
        context: 'Context 1',
      });

      service.observe({
        sessionId: 'session-789',
        timestamp: new Date(),
        behavior: 'Second behavior',
        context: 'Context 2',
      });

      service.observe({
        sessionId: 'other-session',
        timestamp: new Date(),
        behavior: 'Other behavior',
        context: 'Other context',
      });

      const observations = service.getObservationsBySession('session-789');
      expect(observations).toHaveLength(2);
    });
  });

  describe('detect', () => {
    beforeEach(() => {
      service.loadAntipatterns(mockAntipatterns);
    });

    it('should detect matching antipatterns', () => {
      const result = service.detect({
        behavior: 'I keep fixing surface-level issues but the bug keeps coming back',
        context: 'Debugging session',
      });

      expect(result.analyzed).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].antipattern.id).toBe('test-antipattern-1');
    });

    it('should return confidence scores', () => {
      const result = service.detect({
        behavior: 'The requirements are contradictory and conflicting',
        context: 'Planning phase',
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].confidence).toBeGreaterThan(0);
      expect(result.matches[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should return matched signals', () => {
      const result = service.detect({
        behavior: 'Patching symptoms without understanding the root cause',
        context: 'Bug fixing',
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchedSignals.length).toBeGreaterThan(0);
    });

    it('should return suggested escape', () => {
      const result = service.detect({
        behavior: 'Fixing surface-level issues repeatedly',
        context: 'Debugging',
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].suggestedEscape).toContain('Step back');
    });

    it('should return empty matches for unrelated behavior', () => {
      const result = service.detect({
        behavior: 'Writing unit tests for the new feature',
        context: 'TDD session',
      });

      expect(result.analyzed).toBe(true);
      expect(result.matches).toHaveLength(0);
    });

    it('should sort matches by confidence descending', () => {
      const result = service.detect({
        behavior: 'Fixing surface-level issues with contradictory requirements',
        context: 'Complex debugging with conflicting goals',
      });

      if (result.matches.length > 1) {
        for (let i = 1; i < result.matches.length; i++) {
          expect(result.matches[i - 1].confidence).toBeGreaterThanOrEqual(
            result.matches[i].confidence,
          );
        }
      }
    });
  });

  describe('learn', () => {
    beforeEach(() => {
      service.loadAntipatterns(mockAntipatterns);
    });

    it('should increase confidence when antipattern is confirmed', () => {
      const originalAntipattern = service.getAntipattern('test-antipattern-1');
      const originalConfidence = originalAntipattern?.confidence || 0;

      const result = service.learn({
        antipatternId: 'test-antipattern-1',
        sessionId: 'session-learn-1',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      expect(result.updated).toBe(true);
      expect(result.newConfidence).toBeGreaterThan(originalConfidence);
    });

    it('should decrease confidence for paradigm candidate', () => {
      const originalAntipattern = service.getAntipattern('test-antipattern-1');
      const originalConfidence = originalAntipattern?.confidence || 0;

      const result = service.learn({
        antipatternId: 'test-antipattern-1',
        sessionId: 'session-learn-2',
        outcome: LearningOutcome.PARADIGM_CANDIDATE,
      });

      expect(result.updated).toBe(true);
      expect(result.newConfidence).toBeLessThan(originalConfidence);
    });

    it('should add session to source_sessions when confirmed', () => {
      service.learn({
        antipatternId: 'test-antipattern-1',
        sessionId: 'session-learn-3',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      const antipattern = service.getAntipattern('test-antipattern-1');
      expect(antipattern?.source_sessions).toContain('session-learn-3');
    });

    it('should not add duplicate sessions', () => {
      service.learn({
        antipatternId: 'test-antipattern-1',
        sessionId: 'session-learn-4',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      service.learn({
        antipatternId: 'test-antipattern-1',
        sessionId: 'session-learn-4',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      const antipattern = service.getAntipattern('test-antipattern-1');
      const count = antipattern?.source_sessions.filter(
        (s) => s === 'session-learn-4',
      ).length;
      expect(count).toBe(1);
    });

    it('should return updated=false for non-existent antipattern', () => {
      const result = service.learn({
        antipatternId: 'non-existent',
        sessionId: 'session-learn-5',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      expect(result.updated).toBe(false);
      expect(result.newConfidence).toBe(0);
    });

    it('should cap confidence at 1.0', () => {
      service.loadAntipatterns([
        {
          id: 'high-confidence',
          signal: 'Test signal',
          context: 'Test context',
          escape: 'Test escape',
          confidence: 0.98,
          source_sessions: [],
        },
      ]);

      service.learn({
        antipatternId: 'high-confidence',
        sessionId: 'session-1',
        outcome: LearningOutcome.ANTIPATTERN_CONFIRMED,
      });

      const antipattern = service.getAntipattern('high-confidence');
      expect(antipattern?.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should not go below 0.1 confidence', () => {
      service.loadAntipatterns([
        {
          id: 'low-confidence',
          signal: 'Test signal',
          context: 'Test context',
          escape: 'Test escape',
          confidence: 0.12,
          source_sessions: [],
        },
      ]);

      service.learn({
        antipatternId: 'low-confidence',
        sessionId: 'session-1',
        outcome: LearningOutcome.PARADIGM_CANDIDATE,
      });

      const antipattern = service.getAntipattern('low-confidence');
      expect(antipattern?.confidence).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      service.loadAntipatterns(mockAntipatterns);

      service.observe({
        sessionId: 'session-1',
        timestamp: new Date(),
        behavior: 'Behavior 1',
        context: 'Context 1',
      });

      service.observe({
        sessionId: 'session-2',
        timestamp: new Date(),
        behavior: 'Behavior 2',
        context: 'Context 2',
      });

      const stats = service.getStats();

      expect(stats.totalObservations).toBe(2);
      expect(stats.totalAntipatterns).toBe(2);
      expect(stats.confirmedCount).toBe(0);
      expect(stats.paradigmCandidateCount).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      service.loadAntipatterns(mockAntipatterns);
      service.observe({
        sessionId: 'session-1',
        timestamp: new Date(),
        behavior: 'Test',
        context: 'Test',
      });

      service.clear();

      expect(service.getAntipatternCount()).toBe(0);
      expect(service.getStats().totalObservations).toBe(0);
    });
  });
});
