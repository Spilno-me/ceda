import { Test, TestingModule } from '@nestjs/testing';
import { PatternLibraryService } from './pattern-library.service';
import { PatternCategory, PatternConfidence, Pattern } from '../interfaces';

describe('CEDA-32: Grounding Loop - Confidence Decay', () => {
  let service: PatternLibraryService;

  const createTestPattern = (
    id: string,
    confidence?: PatternConfidence,
  ): Pattern => ({
    id,
    name: `Test Pattern ${id}`,
    category: PatternCategory.ASSESSMENT,
    description: 'Test pattern for grounding tests',
    structure: {
      sections: [{ name: 'Test Section', fieldTypes: ['text'], required: true }],
      workflows: ['test'],
      defaultFields: ['id'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'test', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: {
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      successRate: 0,
    },
    confidence,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PatternLibraryService],
    }).compile();

    service = module.get<PatternLibraryService>(PatternLibraryService);
  });

  describe('currentConfidence', () => {
    it('should return 1.0 for patterns without confidence data', () => {
      const pattern = createTestPattern('no-confidence');
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBe(1.0);
    });

    it('should return base confidence for newly grounded patterns', () => {
      const pattern = createTestPattern('new-grounded', {
        base: 0.9,
        lastGrounded: new Date(),
        groundingCount: 1,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBeCloseTo(0.95, 1);
    });

    it('should apply decay based on days since grounding', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const pattern = createTestPattern('decayed', {
        base: 1.0,
        lastGrounded: tenDaysAgo,
        groundingCount: 0,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBeCloseTo(0.9, 1);
    });

    it('should apply grounding count boost (max 30%)', () => {
      const pattern = createTestPattern('boosted', {
        base: 0.7,
        lastGrounded: new Date(),
        groundingCount: 10,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should cap grounding boost at 30%', () => {
      const pattern = createTestPattern('max-boost', {
        base: 0.7,
        lastGrounded: new Date(),
        groundingCount: 100,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBe(1.0);
    });

    it('should enforce minimum confidence floor of 0.1', () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 365);

      const pattern = createTestPattern('floor', {
        base: 0.5,
        lastGrounded: longAgo,
        groundingCount: 0,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBe(0.1);
    });

    it('should handle null lastGrounded (never grounded)', () => {
      const pattern = createTestPattern('never-grounded', {
        base: 0.8,
        lastGrounded: null,
        groundingCount: 0,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.currentConfidence(pattern);
      expect(confidence).toBe(0.8);
    });
  });

  describe('groundPattern', () => {
    it('should update lastGrounded and increment groundingCount on success', () => {
      const pattern = createTestPattern('to-ground');
      service.registerPattern(pattern);

      const before = new Date();
      const updated = service.groundPattern('to-ground', true);
      const after = new Date();

      expect(updated).not.toBeNull();
      expect(updated?.confidence).toBeDefined();
      expect(updated?.confidence?.groundingCount).toBe(1);
      expect(updated?.confidence?.lastGrounded).not.toBeNull();

      const lastGrounded = new Date(updated?.confidence?.lastGrounded as Date);
      expect(lastGrounded.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastGrounded.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should not update on failed execution', () => {
      const pattern = createTestPattern('failed-ground', {
        base: 1.0,
        lastGrounded: null,
        groundingCount: 0,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const updated = service.groundPattern('failed-ground', false);

      expect(updated).not.toBeNull();
      expect(updated?.confidence?.groundingCount).toBe(0);
      expect(updated?.confidence?.lastGrounded).toBeNull();
    });

    it('should return null for non-existent pattern', () => {
      const result = service.groundPattern('non-existent', true);
      expect(result).toBeNull();
    });

    it('should increment groundingCount on multiple successful groundings', () => {
      const pattern = createTestPattern('multi-ground');
      service.registerPattern(pattern);

      service.groundPattern('multi-ground', true);
      service.groundPattern('multi-ground', true);
      const updated = service.groundPattern('multi-ground', true);

      expect(updated?.confidence?.groundingCount).toBe(3);
    });
  });

  describe('getPatternConfidence', () => {
    it('should return current confidence for existing pattern', () => {
      const pattern = createTestPattern('get-confidence', {
        base: 0.9,
        lastGrounded: new Date(),
        groundingCount: 2,
        decayRate: 0.01,
      });
      service.registerPattern(pattern);

      const confidence = service.getPatternConfidence('get-confidence');
      expect(confidence).not.toBeNull();
      expect(confidence).toBeGreaterThan(0);
    });

    it('should return null for non-existent pattern', () => {
      const confidence = service.getPatternConfidence('non-existent');
      expect(confidence).toBeNull();
    });
  });

  describe('initializePatternConfidence', () => {
    it('should initialize confidence for pattern without confidence data', () => {
      const pattern = createTestPattern('init-confidence');
      service.registerPattern(pattern);

      const updated = service.initializePatternConfidence('init-confidence', 0.85);

      expect(updated).not.toBeNull();
      expect(updated?.confidence).toBeDefined();
      expect(updated?.confidence?.base).toBe(0.85);
      expect(updated?.confidence?.groundingCount).toBe(0);
      expect(updated?.confidence?.lastGrounded).toBeNull();
      expect(updated?.confidence?.decayRate).toBe(0.01);
    });

    it('should not overwrite existing confidence data', () => {
      const pattern = createTestPattern('existing-confidence', {
        base: 0.9,
        lastGrounded: new Date(),
        groundingCount: 5,
        decayRate: 0.02,
      });
      service.registerPattern(pattern);

      const updated = service.initializePatternConfidence('existing-confidence', 0.5);

      expect(updated?.confidence?.base).toBe(0.9);
      expect(updated?.confidence?.groundingCount).toBe(5);
    });

    it('should return null for non-existent pattern', () => {
      const result = service.initializePatternConfidence('non-existent');
      expect(result).toBeNull();
    });

    it('should use default base confidence of 1.0', () => {
      const pattern = createTestPattern('default-base');
      service.registerPattern(pattern);

      const updated = service.initializePatternConfidence('default-base');

      expect(updated?.confidence?.base).toBe(1.0);
    });
  });

  describe('confidence decay in pattern matching', () => {
    it('should factor confidence decay into pattern matching scores', () => {
      const freshPattern = createTestPattern('fresh-pattern', {
        base: 1.0,
        lastGrounded: new Date(),
        groundingCount: 5,
        decayRate: 0.01,
      });

      const stalePattern = createTestPattern('stale-pattern', {
        base: 1.0,
        lastGrounded: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        groundingCount: 0,
        decayRate: 0.01,
      });

      service.registerPattern(freshPattern);
      service.registerPattern(stalePattern);

      const freshConfidence = service.currentConfidence(freshPattern);
      const staleConfidence = service.currentConfidence(stalePattern);

      expect(freshConfidence).toBeGreaterThan(staleConfidence);
    });
  });
});

describe('CEDA-32: LegionService', () => {
  it('should gracefully degrade when LEGION_API_URL is not set', async () => {
    const originalEnv = process.env.LEGION_API_URL;
    delete process.env.LEGION_API_URL;

    const { LegionService } = await import('./legion.service');
    const legionService = new LegionService();

    expect(legionService.isAvailable()).toBe(false);

    const proposalId = await legionService.createProposal(
      { moduleType: 'test', sections: [], confidence: 0.9, rationale: 'test', alternatives: [] },
      'session-123',
      'pattern-123',
    );
    expect(proposalId).toBeNull();

    const proposals = await legionService.queryProposals('pattern-123');
    expect(proposals).toEqual([]);

    process.env.LEGION_API_URL = originalEnv;
  });
});
