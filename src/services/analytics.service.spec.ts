/**
 * CEDA-50: Analytics Service Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { AuditService, AuditEvent } from './audit.service';
import { ObservationService } from './observation.service';
import { PatternLibraryService } from './pattern-library.service';
import { SessionService } from './session.service';
import { EmbeddingService } from './embedding.service';
import { Observation, Pattern, PatternCategory } from '../interfaces';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let auditService: AuditService;
  let observationService: ObservationService;
  let patternLibrary: PatternLibraryService;
  let sessionService: SessionService;

  const mockObservations: Observation[] = [
    {
      id: 'obs-1',
      sessionId: 'session-1',
      company: 'test-company',
      project: 'test-project',
      user: 'user-1',
      patternId: 'pattern-1',
      patternName: 'Test Pattern 1',
      prediction: {
        moduleType: 'assessment',
        sections: [],
        confidence: 0.85,
        rationale: 'Test',
        alternatives: [],
      },
      outcome: 'accepted',
      modifications: [],
      input: 'test input 1',
      confidence: 0.85,
      processingTime: 100,
      timestamp: new Date(),
      source: 'live',
    },
    {
      id: 'obs-2',
      sessionId: 'session-2',
      company: 'test-company',
      project: 'test-project',
      user: 'user-1',
      patternId: 'pattern-1',
      patternName: 'Test Pattern 1',
      prediction: {
        moduleType: 'assessment',
        sections: [],
        confidence: 0.75,
        rationale: 'Test',
        alternatives: [],
      },
      outcome: 'modified',
      modifications: [],
      input: 'test input 2',
      confidence: 0.75,
      processingTime: 150,
      timestamp: new Date(),
      source: 'live',
    },
    {
      id: 'obs-3',
      sessionId: 'session-3',
      company: 'test-company',
      project: 'test-project',
      user: 'user-2',
      patternId: 'pattern-2',
      patternName: 'Test Pattern 2',
      prediction: {
        moduleType: 'incident',
        sections: [],
        confidence: 0.90,
        rationale: 'Test',
        alternatives: [],
      },
      outcome: 'accepted',
      modifications: [],
      input: 'test input 3',
      confidence: 0.90,
      processingTime: 80,
      timestamp: new Date(),
      source: 'live',
    },
    {
      id: 'obs-4',
      sessionId: 'session-4',
      company: 'other-company',
      project: 'other-project',
      user: 'user-3',
      patternId: 'pattern-1',
      patternName: 'Test Pattern 1',
      prediction: {
        moduleType: 'assessment',
        sections: [],
        confidence: 0.80,
        rationale: 'Test',
        alternatives: [],
      },
      outcome: 'rejected',
      modifications: [],
      input: 'test input 4',
      confidence: 0.80,
      processingTime: 200,
      timestamp: new Date(),
      source: 'live',
    },
  ];

  const mockPatterns: Pattern[] = [
    {
      id: 'pattern-1',
      name: 'Test Pattern 1',
      description: 'Test pattern for assessments',
      category: PatternCategory.ASSESSMENT,
      structure: {
        sections: [],
        workflows: [],
        defaultFields: [],
      },
      applicabilityRules: [],
      confidenceFactors: [],
      metadata: {
        version: '1.0',
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    {
      id: 'pattern-2',
      name: 'Test Pattern 2',
      description: 'Test pattern for incidents',
      category: PatternCategory.INCIDENT,
      structure: {
        sections: [],
        workflows: [],
        defaultFields: [],
      },
      applicabilityRules: [],
      confidenceFactors: [],
      metadata: {
        version: '1.0',
        usageCount: 0,
        successRate: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ];

  const mockAuditEvents: AuditEvent[] = [
    {
      id: 'audit-1',
      timestamp: new Date(),
      action: 'observation_captured',
      entityId: 'obs-1',
      company: 'test-company',
      user: 'user-1',
      details: {},
      ip: '127.0.0.1',
    },
    {
      id: 'audit-2',
      timestamp: new Date(),
      action: 'pattern_created',
      entityId: 'pattern-1',
      company: 'test-company',
      user: 'user-1',
      details: {},
      ip: '127.0.0.1',
    },
  ];

  beforeEach(async () => {
    const embeddingService = new EmbeddingService();
    
    auditService = new AuditService();
    observationService = new ObservationService(embeddingService);
    patternLibrary = new PatternLibraryService();
    sessionService = new SessionService();

    jest.spyOn(observationService, 'getObservations').mockResolvedValue(mockObservations);
    jest.spyOn(auditService, 'getEvents').mockResolvedValue(mockAuditEvents);
    jest.spyOn(patternLibrary, 'getAllPatterns').mockReturnValue(mockPatterns);
    jest.spyOn(sessionService, 'getActiveSessionCount').mockReturnValue(5);

    service = new AnalyticsService(
      auditService,
      observationService,
      patternLibrary,
      sessionService,
    );
  });

  afterEach(() => {
    service.clearCache();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should calculate metrics correctly for a company', async () => {
      const metrics = await service.getMetrics({ company: 'test-company', period: 'week' });

      expect(metrics).toBeDefined();
      expect(metrics.observations).toBeGreaterThanOrEqual(0);
      expect(metrics.patterns).toBe(2);
      expect(metrics.sessions).toBe(5);
      expect(metrics.acceptanceRate).toBeGreaterThanOrEqual(0);
      expect(metrics.acceptanceRate).toBeLessThanOrEqual(1);
      expect(metrics.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(metrics.avgConfidence).toBeLessThanOrEqual(1);
    });

    it('should return cached metrics on subsequent calls', async () => {
      const metrics1 = await service.getMetrics({ company: 'test-company', period: 'week' });
      const metrics2 = await service.getMetrics({ company: 'test-company', period: 'week' });

      expect(metrics1).toEqual(metrics2);
      expect(observationService.getObservations).toHaveBeenCalledTimes(1);
    });

    it('should handle empty observations', async () => {
      jest.spyOn(observationService, 'getObservations').mockResolvedValue([]);

      const metrics = await service.getMetrics({ company: 'empty-company', period: 'week' });

      expect(metrics.observations).toBe(0);
      expect(metrics.acceptanceRate).toBe(0);
      expect(metrics.avgConfidence).toBe(0);
    });
  });

  describe('getTrends', () => {
    it('should return trend data for a company', async () => {
      const trends = await service.getTrends({ company: 'test-company', period: 'week' });

      expect(trends).toBeDefined();
      expect(Array.isArray(trends)).toBe(true);
      trends.forEach(trend => {
        expect(trend.timestamp).toBeDefined();
        expect(typeof trend.predictions).toBe('number');
        expect(typeof trend.observations).toBe('number');
        expect(typeof trend.acceptanceRate).toBe('number');
      });
    });

    it('should create correct number of buckets for day period', async () => {
      const trends = await service.getTrends({ company: 'test-company', period: 'day' });

      expect(trends.length).toBeLessThanOrEqual(24);
    });
  });

  describe('getTopPatterns', () => {
    it('should return top patterns sorted by usage', async () => {
      const topPatterns = await service.getTopPatterns({ company: 'test-company', period: 'week' });

      expect(topPatterns).toBeDefined();
      expect(Array.isArray(topPatterns)).toBe(true);
      
      if (topPatterns.length > 1) {
        expect(topPatterns[0].usageCount).toBeGreaterThanOrEqual(topPatterns[1].usageCount);
      }
    });

    it('should respect limit parameter', async () => {
      const topPatterns = await service.getTopPatterns({ company: 'test-company', period: 'week' }, 1);

      expect(topPatterns.length).toBeLessThanOrEqual(1);
    });

    it('should calculate acceptance rate per pattern', async () => {
      const topPatterns = await service.getTopPatterns({ company: 'test-company', period: 'week' });

      topPatterns.forEach(pattern => {
        expect(pattern.acceptanceRate).toBeGreaterThanOrEqual(0);
        expect(pattern.acceptanceRate).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('getActiveUsers', () => {
    it('should return active users sorted by activity', async () => {
      const activeUsers = await service.getActiveUsers({ company: 'test-company', period: 'week' });

      expect(activeUsers).toBeDefined();
      expect(Array.isArray(activeUsers)).toBe(true);
      
      if (activeUsers.length > 1) {
        expect(activeUsers[0].predictions).toBeGreaterThanOrEqual(activeUsers[1].predictions);
      }
    });

    it('should include lastActive timestamp', async () => {
      const activeUsers = await service.getActiveUsers({ company: 'test-company', period: 'week' });

      activeUsers.forEach(user => {
        expect(user.lastActive).toBeDefined();
        expect(user.lastActive instanceof Date).toBe(true);
      });
    });
  });

  describe('getCompanyAnalytics', () => {
    it('should return full analytics dashboard data', async () => {
      const analytics = await service.getCompanyAnalytics({ company: 'test-company', period: 'week' });

      expect(analytics).toBeDefined();
      expect(analytics.company).toBe('test-company');
      expect(analytics.period).toBe('week');
      expect(analytics.periodStart).toBeDefined();
      expect(analytics.periodEnd).toBeDefined();
      expect(analytics.metrics).toBeDefined();
      expect(analytics.trends).toBeDefined();
      expect(analytics.topPatterns).toBeDefined();
      expect(analytics.activeUsers).toBeDefined();
    });

    it('should use default period of week when not specified', async () => {
      const analytics = await service.getCompanyAnalytics({ company: 'test-company' });

      expect(analytics.period).toBe('week');
    });
  });

  describe('getSystemAnalytics', () => {
    it('should return system-wide analytics', async () => {
      const systemAnalytics = await service.getSystemAnalytics();

      expect(systemAnalytics).toBeDefined();
      expect(typeof systemAnalytics.totalCompanies).toBe('number');
      expect(typeof systemAnalytics.totalPatterns).toBe('number');
      expect(typeof systemAnalytics.totalObservations).toBe('number');
      expect(typeof systemAnalytics.totalSessions).toBe('number');
      expect(typeof systemAnalytics.acceptanceRate).toBe('number');
      expect(typeof systemAnalytics.avgConfidence).toBe('number');
      expect(Array.isArray(systemAnalytics.topCompanies)).toBe(true);
    });

    it('should count unique companies', async () => {
      const systemAnalytics = await service.getSystemAnalytics();

      expect(systemAnalytics.totalCompanies).toBe(2);
    });
  });

  describe('caching', () => {
    it('should cache results and return from cache', async () => {
      await service.getMetrics({ company: 'test-company', period: 'week' });
      
      const cacheStats = service.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
    });

    it('should clear cache when clearCache is called', async () => {
      await service.getMetrics({ company: 'test-company', period: 'week' });
      
      service.clearCache();
      
      const cacheStats = service.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });

    it('should use different cache keys for different periods', async () => {
      await service.getMetrics({ company: 'test-company', period: 'day' });
      await service.getMetrics({ company: 'test-company', period: 'week' });
      
      const cacheStats = service.getCacheStats();
      expect(cacheStats.size).toBe(2);
    });
  });

  describe('period validation', () => {
    it('should handle day period', async () => {
      const analytics = await service.getCompanyAnalytics({ company: 'test-company', period: 'day' });
      expect(analytics.period).toBe('day');
    });

    it('should handle week period', async () => {
      const analytics = await service.getCompanyAnalytics({ company: 'test-company', period: 'week' });
      expect(analytics.period).toBe('week');
    });

    it('should handle month period', async () => {
      const analytics = await service.getCompanyAnalytics({ company: 'test-company', period: 'month' });
      expect(analytics.period).toBe('month');
    });
  });
});
