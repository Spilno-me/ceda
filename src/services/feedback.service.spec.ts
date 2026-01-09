import { Test, TestingModule } from '@nestjs/testing';
import {
  FeedbackService,
  FeedbackType,
  ModificationAction,
  LearningSignalType,
  UserContext,
} from './feedback.service';
import { StructurePrediction } from '../interfaces';

describe('FeedbackService', () => {
  let service: FeedbackService;

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

  const mockUserContext: UserContext = {
    userId: 'user-123',
    companyId: 'company-456',
    previousInteractions: 5,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedbackService],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  afterEach(() => {
    service.clearFeedback();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('session management', () => {
    it('should start a session', () => {
      expect(() => {
        service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      }).not.toThrow();
    });

    it('should record modifications during session', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);

      service.recordModification(
        'session-1',
        ModificationAction.ADD_FIELD,
        'sections[0].fields',
        null,
        { name: 'Notes', type: 'textarea' },
      );

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.MODIFIED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        1000,
      );

      expect(feedback.modifications).toHaveLength(1);
      expect(feedback.modifications[0].action).toBe(ModificationAction.ADD_FIELD);
    });
  });

  describe('submitFeedback', () => {
    it('should store accepted feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.ACCEPTED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        500,
      );

      expect(feedback.id).toBeDefined();
      expect(feedback.feedbackType).toBe(FeedbackType.ACCEPTED);
      expect(feedback.processingTime).toBe(500);
    });

    it('should store rejected feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.REJECTED,
        mockPrediction,
        null,
        mockUserContext,
        300,
      );

      expect(feedback.feedbackType).toBe(FeedbackType.REJECTED);
      expect(feedback.finalPrediction).toBeNull();
    });

    it('should include all modifications in feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);

      service.recordModification('session-1', ModificationAction.ADD_FIELD, 'field1', null, {});
      service.recordModification('session-1', ModificationAction.REMOVE_FIELD, 'field2', {}, null);
      service.recordModification('session-1', ModificationAction.RENAME_FIELD, 'field3', 'old', 'new');

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.MODIFIED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        1500,
      );

      expect(feedback.modifications).toHaveLength(3);
    });
  });

  describe('deriveLearningSignals', () => {
    it('should derive positive reinforcement for accepted feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.ACCEPTED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        500,
      );

      const signals = service.deriveLearningSignals(feedback);

      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].signalType).toBe(LearningSignalType.POSITIVE_REINFORCEMENT);
      expect(signals[0].weight).toBe(1.0);
    });

    it('should derive negative reinforcement for rejected feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.REJECTED,
        mockPrediction,
        null,
        mockUserContext,
        500,
      );

      const signals = service.deriveLearningSignals(feedback);

      expect(signals.some((s) => s.signalType === LearningSignalType.NEGATIVE_REINFORCEMENT)).toBe(true);
    });

    it('should derive pattern correction for modified feedback', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      service.recordModification('session-1', ModificationAction.ADD_FIELD, 'f1', null, {});
      service.recordModification('session-1', ModificationAction.ADD_FIELD, 'f2', null, {});

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.MODIFIED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        1000,
      );

      const signals = service.deriveLearningSignals(feedback);

      expect(signals.some((s) => s.signalType === LearningSignalType.PATTERN_CORRECTION)).toBe(true);
    });

    it('should identify new pattern candidate for heavy modifications', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);

      // Add 5+ modifications
      for (let i = 0; i < 6; i++) {
        service.recordModification('session-1', ModificationAction.ADD_FIELD, `field-${i}`, null, {});
      }

      const feedback = service.submitFeedback(
        'session-1',
        FeedbackType.MODIFIED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        2000,
      );

      const signals = service.deriveLearningSignals(feedback);

      expect(signals.some((s) => s.signalType === LearningSignalType.NEW_PATTERN_CANDIDATE)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no feedback', () => {
      const stats = service.getStats();

      expect(stats.totalFeedback).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
    });

    it('should calculate acceptance rate correctly', () => {
      // Add 3 accepted, 1 rejected
      for (let i = 0; i < 3; i++) {
        service.startSession(`session-${i}`, mockPrediction, {} as any, mockUserContext);
        service.submitFeedback(
          `session-${i}`,
          FeedbackType.ACCEPTED,
          mockPrediction,
          mockPrediction,
          mockUserContext,
          500,
        );
      }

      service.startSession('session-rejected', mockPrediction, {} as any, mockUserContext);
      service.submitFeedback(
        'session-rejected',
        FeedbackType.REJECTED,
        mockPrediction,
        null,
        mockUserContext,
        500,
      );

      const stats = service.getStats();

      expect(stats.totalFeedback).toBe(4);
      expect(stats.acceptanceRate).toBe(0.75);
      expect(stats.rejectionRate).toBe(0.25);
    });

    it('should track top modification actions', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      service.recordModification('session-1', ModificationAction.ADD_FIELD, 'f1', null, {});
      service.recordModification('session-1', ModificationAction.ADD_FIELD, 'f2', null, {});
      service.recordModification('session-1', ModificationAction.REMOVE_FIELD, 'f3', {}, null);

      service.submitFeedback(
        'session-1',
        FeedbackType.MODIFIED,
        mockPrediction,
        mockPrediction,
        mockUserContext,
        1000,
      );

      const stats = service.getStats();

      expect(stats.topModificationActions.length).toBeGreaterThan(0);
      expect(stats.topModificationActions[0].action).toBe(ModificationAction.ADD_FIELD);
      expect(stats.topModificationActions[0].count).toBe(2);
    });

    it('should filter by company', () => {
      const otherContext: UserContext = { ...mockUserContext, companyId: 'other-company' };

      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      service.submitFeedback('session-1', FeedbackType.ACCEPTED, mockPrediction, mockPrediction, mockUserContext, 500);

      service.startSession('session-2', mockPrediction, {} as any, otherContext);
      service.submitFeedback('session-2', FeedbackType.REJECTED, mockPrediction, null, otherContext, 500);

      const stats = service.getStats({ companyId: mockUserContext.companyId });

      expect(stats.totalFeedback).toBe(1);
      expect(stats.acceptanceRate).toBe(1.0);
    });
  });

  describe('feedback retrieval', () => {
    it('should get feedback by session', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      service.submitFeedback('session-1', FeedbackType.ACCEPTED, mockPrediction, mockPrediction, mockUserContext, 500);

      const feedback = service.getFeedbackBySession('session-1');

      expect(feedback).toBeDefined();
      expect(feedback?.sessionId).toBe('session-1');
    });

    it('should get feedback by pattern', () => {
      service.startSession('session-1', mockPrediction, {} as any, mockUserContext);
      service.submitFeedback('session-1', FeedbackType.ACCEPTED, mockPrediction, mockPrediction, mockUserContext, 500);

      const feedbackList = service.getFeedbackByPattern('assessment');

      expect(feedbackList).toHaveLength(1);
    });
  });
});
