import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PatternLibraryService } from './pattern-library.service';
import { QualityScoreService } from './quality-score.service';
import { Pattern, PatternCategory, AnomalyType } from '../interfaces';

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService;
  let patternLibrary: PatternLibraryService;
  let qualityScoreService: QualityScoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyDetectionService,
        PatternLibraryService,
        QualityScoreService,
      ],
    }).compile();

    service = module.get<AnomalyDetectionService>(AnomalyDetectionService);
    patternLibrary = module.get<PatternLibraryService>(PatternLibraryService);
    qualityScoreService = module.get<QualityScoreService>(QualityScoreService);
  });

  afterEach(() => {
    service.clearAnomalies();
    patternLibrary.clearPatterns();
  });

  const createTestPattern = (overrides: Partial<Pattern> = {}): Pattern => ({
    id: `test-pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Pattern',
    category: PatternCategory.ASSESSMENT,
    description: 'A test pattern',
    structure: {
      sections: [{ name: 'Test Section', fieldTypes: ['text'], required: true }],
      workflows: ['draft', 'review', 'approve'],
      defaultFields: ['id', 'createdAt'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: 'CREATE', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: {
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      successRate: 0,
    },
    company: 'test-company',
    ...overrides,
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectBurstCreation', () => {
    it('should detect burst creation when >20 patterns created in the last hour', () => {
      const company = 'burst-test-company';
      const now = new Date();

      for (let i = 0; i < 25; i++) {
        const pattern = createTestPattern({
          id: `burst-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: new Date(now.getTime() - i * 1000),
            updatedAt: new Date(now.getTime() - i * 1000),
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectBurstCreation(company);

      expect(anomaly).not.toBeNull();
      expect(anomaly?.type).toBe(AnomalyType.BURST_CREATION);
      expect(anomaly?.company).toBe(company);
      expect(anomaly?.status).toBe('open');
      expect(anomaly?.evidence.length).toBe(25);
    });

    it('should not flag normal activity (<= 20 patterns/hour)', () => {
      const company = 'normal-company';
      const now = new Date();

      for (let i = 0; i < 15; i++) {
        const pattern = createTestPattern({
          id: `normal-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: new Date(now.getTime() - i * 1000),
            updatedAt: new Date(now.getTime() - i * 1000),
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectBurstCreation(company);

      expect(anomaly).toBeNull();
    });

    it('should not count patterns created more than an hour ago', () => {
      const company = 'old-patterns-company';
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      for (let i = 0; i < 25; i++) {
        const pattern = createTestPattern({
          id: `old-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: twoHoursAgo,
            updatedAt: twoHoursAgo,
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectBurstCreation(company);

      expect(anomaly).toBeNull();
    });
  });

  describe('detectLowQualityFlood', () => {
    it('should detect low quality flood when >50% patterns are low quality', () => {
      const company = 'low-quality-company';

      for (let i = 0; i < 6; i++) {
        const pattern = createTestPattern({
          id: `low-quality-pattern-${i}`,
          company,
          name: '',
          description: '',
          structure: {
            sections: [],
            workflows: [],
            defaultFields: [],
          },
          applicabilityRules: [],
          qualityScore: 10,
        });
        patternLibrary.registerPattern(pattern);
      }

      for (let i = 0; i < 4; i++) {
        const pattern = createTestPattern({
          id: `high-quality-pattern-${i}`,
          company,
          qualityScore: 80,
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectLowQualityFlood(company);

      expect(anomaly).not.toBeNull();
      expect(anomaly?.type).toBe(AnomalyType.LOW_QUALITY_FLOOD);
      expect(anomaly?.company).toBe(company);
    });

    it('should not flag when quality is acceptable (<= 50% low quality)', () => {
      const company = 'good-quality-company';

      for (let i = 0; i < 3; i++) {
        const pattern = createTestPattern({
          id: `low-quality-pattern-${i}`,
          company,
          qualityScore: 10,
        });
        patternLibrary.registerPattern(pattern);
      }

      for (let i = 0; i < 7; i++) {
        const pattern = createTestPattern({
          id: `high-quality-pattern-${i}`,
          company,
          qualityScore: 80,
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectLowQualityFlood(company);

      expect(anomaly).toBeNull();
    });

    it('should return null for company with no patterns', () => {
      const anomaly = service.detectLowQualityFlood('empty-company');

      expect(anomaly).toBeNull();
    });
  });

  describe('detectDuplicateSpam', () => {
    it('should detect duplicate pattern submissions', () => {
      const company = 'duplicate-company';

      for (let i = 0; i < 3; i++) {
        const pattern = createTestPattern({
          id: `duplicate-pattern-${i}`,
          name: 'Duplicate Pattern Name',
          company,
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectDuplicateSpam(company);

      expect(anomaly).not.toBeNull();
      expect(anomaly?.type).toBe(AnomalyType.DUPLICATE_SPAM);
      expect(anomaly?.company).toBe(company);
    });

    it('should not flag unique pattern names', () => {
      const company = 'unique-company';

      for (let i = 0; i < 5; i++) {
        const pattern = createTestPattern({
          id: `unique-pattern-${i}`,
          name: `Unique Pattern ${i}`,
          company,
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectDuplicateSpam(company);

      expect(anomaly).toBeNull();
    });
  });

  describe('runDetectionSweep', () => {
    it('should run all detection methods for a specific company', async () => {
      const company = 'sweep-company';
      const now = new Date();

      for (let i = 0; i < 25; i++) {
        const pattern = createTestPattern({
          id: `sweep-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: new Date(now.getTime() - i * 1000),
            updatedAt: new Date(now.getTime() - i * 1000),
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const results = await service.runDetectionSweep(company);

      expect(results).toHaveLength(1);
      expect(results[0].company).toBe(company);
      expect(results[0].anomaliesDetected.length).toBeGreaterThan(0);
      expect(results[0].scannedEntities).toBe(25);
    });

    it('should scan all companies when no company specified', async () => {
      const companies = ['company-a', 'company-b'];

      for (const company of companies) {
        const pattern = createTestPattern({
          id: `pattern-${company}`,
          company,
        });
        patternLibrary.registerPattern(pattern);
      }

      const results = await service.runDetectionSweep();

      expect(results.length).toBe(companies.length);
    });
  });

  describe('acknowledge', () => {
    it('should update anomaly status to acknowledged', async () => {
      const company = 'ack-company';
      const now = new Date();

      for (let i = 0; i < 25; i++) {
        const pattern = createTestPattern({
          id: `ack-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: new Date(now.getTime() - i * 1000),
            updatedAt: new Date(now.getTime() - i * 1000),
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectBurstCreation(company);
      expect(anomaly).not.toBeNull();

      const acknowledged = await service.acknowledge(anomaly!.id, 'admin@test.com');

      expect(acknowledged).not.toBeNull();
      expect(acknowledged?.status).toBe('acknowledged');
      expect(acknowledged?.acknowledgedBy).toBe('admin@test.com');
      expect(acknowledged?.acknowledgedAt).toBeDefined();
    });

    it('should return null for non-existent anomaly', async () => {
      const result = await service.acknowledge('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('resolve', () => {
    it('should update anomaly status to resolved', async () => {
      const company = 'resolve-company';
      const now = new Date();

      for (let i = 0; i < 25; i++) {
        const pattern = createTestPattern({
          id: `resolve-pattern-${i}`,
          company,
          metadata: {
            version: '1.0.0',
            createdAt: new Date(now.getTime() - i * 1000),
            updatedAt: new Date(now.getTime() - i * 1000),
            usageCount: 0,
            successRate: 0,
          },
        });
        patternLibrary.registerPattern(pattern);
      }

      const anomaly = service.detectBurstCreation(company);
      expect(anomaly).not.toBeNull();

      const resolved = await service.resolve(anomaly!.id, 'admin@test.com');

      expect(resolved).not.toBeNull();
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolvedBy).toBe('admin@test.com');
      expect(resolved?.resolvedAt).toBeDefined();
    });

    it('should return null for non-existent anomaly', async () => {
      const result = await service.resolve('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getAnomalies', () => {
    it('should filter anomalies by company', async () => {
      const company1 = 'filter-company-1';
      const company2 = 'filter-company-2';
      const now = new Date();

      for (const company of [company1, company2]) {
        for (let i = 0; i < 25; i++) {
          const pattern = createTestPattern({
            id: `filter-pattern-${company}-${i}`,
            company,
            metadata: {
              version: '1.0.0',
              createdAt: new Date(now.getTime() - i * 1000),
              updatedAt: new Date(now.getTime() - i * 1000),
              usageCount: 0,
              successRate: 0,
            },
          });
          patternLibrary.registerPattern(pattern);
        }
        service.detectBurstCreation(company);
      }

      const anomalies = await service.getAnomalies({ company: company1 });

      expect(anomalies.length).toBe(1);
      expect(anomalies[0].company).toBe(company1);
    });

    it('should return all anomalies when no filter specified', async () => {
      const companies = ['all-company-1', 'all-company-2'];
      const now = new Date();

      for (const company of companies) {
        for (let i = 0; i < 25; i++) {
          const pattern = createTestPattern({
            id: `all-pattern-${company}-${i}`,
            company,
            metadata: {
              version: '1.0.0',
              createdAt: new Date(now.getTime() - i * 1000),
              updatedAt: new Date(now.getTime() - i * 1000),
              usageCount: 0,
              successRate: 0,
            },
          });
          patternLibrary.registerPattern(pattern);
        }
        service.detectBurstCreation(company);
      }

      const anomalies = await service.getAnomalies();

      expect(anomalies.length).toBe(2);
    });
  });

  describe('getters', () => {
    it('should return correct burst threshold', () => {
      expect(service.getBurstThreshold()).toBe(20);
    });

    it('should return correct low quality threshold', () => {
      expect(service.getLowQualityThreshold()).toBe(0.5);
    });
  });
});
