import { Test, TestingModule } from '@nestjs/testing';
import { QualityScoreService } from './quality-score.service';
import { Pattern, PatternCategory } from '../interfaces';

describe('QualityScoreService', () => {
  let service: QualityScoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QualityScoreService],
    }).compile();

    service = module.get<QualityScoreService>(QualityScoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const createTestPattern = (overrides: Partial<Pattern> = {}): Pattern => ({
    id: 'test-pattern',
    name: 'Test Pattern',
    category: PatternCategory.ASSESSMENT,
    description: 'A test pattern for quality score testing',
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
    ...overrides,
  });

  describe('calculateScore', () => {
    it('should return score based on quality factors for a new pattern', () => {
      const pattern = createTestPattern();
      const score = service.calculateScore(pattern);
      // New pattern with complete structure and recent update gets:
      // usageFrequency: 50, acceptanceRate: 50, consistency: 50, recency: 100, completeness: 100
      // Score = 50*0.30 + 50*0.30 + 50*0.20 + 100*0.10 + 100*0.10 = 60
      expect(score).toBe(60);
    });

    it('should return higher score for patterns with high usage', () => {
      const pattern = createTestPattern({
        metadata: {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 100,
          successRate: 0.9,
        },
      });
      const score = service.calculateScore(pattern);
      expect(score).toBeGreaterThan(50);
    });

    it('should return lower score for patterns with low success rate', () => {
      const pattern = createTestPattern({
        metadata: {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 50,
          successRate: 0.1,
        },
      });
      const score = service.calculateScore(pattern);
      expect(score).toBeLessThan(70);
    });

    it('should return score between 0 and 100', () => {
      const pattern = createTestPattern();
      const score = service.calculateScore(pattern);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should factor in confidence data when available', () => {
      const patternWithConfidence = createTestPattern({
        confidence: {
          base: 0.9,
          lastGrounded: new Date(),
          groundingCount: 10,
          decayRate: 0.01,
        },
      });
      const patternWithoutConfidence = createTestPattern();
      
      const scoreWithConfidence = service.calculateScore(patternWithConfidence);
      const scoreWithoutConfidence = service.calculateScore(patternWithoutConfidence);
      
      expect(scoreWithConfidence).toBeGreaterThanOrEqual(scoreWithoutConfidence);
    });
  });

  describe('getQualityFactors', () => {
    it('should return all quality factors', () => {
      const pattern = createTestPattern();
      const factors = service.getQualityFactors(pattern);
      
      expect(factors).toHaveProperty('usageFrequency');
      expect(factors).toHaveProperty('acceptanceRate');
      expect(factors).toHaveProperty('consistency');
      expect(factors).toHaveProperty('recency');
      expect(factors).toHaveProperty('completeness');
    });

    it('should return factors between 0 and 100', () => {
      const pattern = createTestPattern();
      const factors = service.getQualityFactors(pattern);
      
      expect(factors.usageFrequency).toBeGreaterThanOrEqual(0);
      expect(factors.usageFrequency).toBeLessThanOrEqual(100);
      expect(factors.acceptanceRate).toBeGreaterThanOrEqual(0);
      expect(factors.acceptanceRate).toBeLessThanOrEqual(100);
      expect(factors.consistency).toBeGreaterThanOrEqual(0);
      expect(factors.consistency).toBeLessThanOrEqual(100);
      expect(factors.recency).toBeGreaterThanOrEqual(0);
      expect(factors.recency).toBeLessThanOrEqual(100);
      expect(factors.completeness).toBeGreaterThanOrEqual(0);
      expect(factors.completeness).toBeLessThanOrEqual(100);
    });

    it('should return high completeness for well-defined patterns', () => {
      const pattern = createTestPattern();
      const factors = service.getQualityFactors(pattern);
      
      expect(factors.completeness).toBe(100);
    });

    it('should return lower completeness for incomplete patterns', () => {
      const incompletePattern = createTestPattern({
        name: '',
        description: '',
        structure: {
          sections: [],
          workflows: [],
          defaultFields: [],
        },
        applicabilityRules: [],
      });
      const factors = service.getQualityFactors(incompletePattern);
      
      expect(factors.completeness).toBeLessThan(100);
    });

    it('should return high recency for recently updated patterns', () => {
      const recentPattern = createTestPattern({
        metadata: {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 0,
          successRate: 0,
        },
      });
      const factors = service.getQualityFactors(recentPattern);
      
      expect(factors.recency).toBeGreaterThanOrEqual(80);
    });

    it('should return lower recency for old patterns', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      
      const oldPattern = createTestPattern({
        metadata: {
          version: '1.0.0',
          createdAt: oldDate,
          updatedAt: oldDate,
          usageCount: 0,
          successRate: 0,
        },
      });
      const factors = service.getQualityFactors(oldPattern);
      
      expect(factors.recency).toBeLessThan(50);
    });
  });

  describe('flagLowQuality', () => {
    it('should return empty array when no patterns are below threshold', () => {
      const highQualityPattern = createTestPattern({
        qualityScore: 80,
      });
      const result = service.flagLowQuality([highQualityPattern], 30);
      
      expect(result).toHaveLength(0);
    });

    it('should return patterns below the threshold', () => {
      const lowQualityPattern = createTestPattern({
        id: 'low-quality',
        qualityScore: 20,
      });
      const highQualityPattern = createTestPattern({
        id: 'high-quality',
        qualityScore: 80,
      });
      
      const result = service.flagLowQuality([lowQualityPattern, highQualityPattern], 30);
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('low-quality');
    });

    it('should use default threshold of 30 when not specified', () => {
      const lowQualityPattern = createTestPattern({
        qualityScore: 25,
      });
      
      const result = service.flagLowQuality([lowQualityPattern]);
      
      expect(result).toHaveLength(1);
    });

    it('should calculate score if qualityScore is not set', () => {
      const pattern = createTestPattern();
      const result = service.flagLowQuality([pattern], 100);
      
      expect(result).toHaveLength(1);
    });

    it('should handle custom threshold', () => {
      const pattern = createTestPattern({
        qualityScore: 45,
      });
      
      const resultWithLowThreshold = service.flagLowQuality([pattern], 40);
      const resultWithHighThreshold = service.flagLowQuality([pattern], 50);
      
      expect(resultWithLowThreshold).toHaveLength(0);
      expect(resultWithHighThreshold).toHaveLength(1);
    });
  });

  describe('getQualityScoreResult', () => {
    it('should return complete quality score result', () => {
      const pattern = createTestPattern({
        qualityScore: 75,
      });
      
      const result = service.getQualityScoreResult(pattern);
      
      expect(result.patternId).toBe('test-pattern');
      expect(result.score).toBe(75);
      expect(result.factors).toBeDefined();
      expect(result.isLowQuality).toBe(false);
      expect(result.threshold).toBe(30);
    });

    it('should flag low quality patterns correctly', () => {
      const pattern = createTestPattern({
        qualityScore: 20,
      });
      
      const result = service.getQualityScoreResult(pattern);
      
      expect(result.isLowQuality).toBe(true);
    });

    it('should use custom threshold for low quality determination', () => {
      const pattern = createTestPattern({
        qualityScore: 45,
      });
      
      const resultWithLowThreshold = service.getQualityScoreResult(pattern, 40);
      const resultWithHighThreshold = service.getQualityScoreResult(pattern, 50);
      
      expect(resultWithLowThreshold.isLowQuality).toBe(false);
      expect(resultWithHighThreshold.isLowQuality).toBe(true);
    });

    it('should calculate score if qualityScore is not set', () => {
      const pattern = createTestPattern();
      
      const result = service.getQualityScoreResult(pattern);
      
      expect(result.score).toBeDefined();
      expect(typeof result.score).toBe('number');
    });
  });

  describe('getDefaultScore', () => {
    it('should return 50', () => {
      expect(service.getDefaultScore()).toBe(50);
    });
  });

  describe('getDefaultThreshold', () => {
    it('should return 30', () => {
      expect(service.getDefaultThreshold()).toBe(30);
    });
  });

  describe('getWeights', () => {
    it('should return correct weights', () => {
      const weights = service.getWeights();
      
      expect(weights.usageFrequency).toBe(0.30);
      expect(weights.acceptanceRate).toBe(0.30);
      expect(weights.consistency).toBe(0.20);
      expect(weights.recency).toBe(0.10);
      expect(weights.completeness).toBe(0.10);
    });

    it('should return weights that sum to 1', () => {
      const weights = service.getWeights();
      const sum = weights.usageFrequency + weights.acceptanceRate + 
                  weights.consistency + weights.recency + weights.completeness;
      
      expect(sum).toBe(1);
    });
  });
});
