import { Test, TestingModule } from '@nestjs/testing';
import { PatternLibraryService } from './pattern-library.service';
import { PatternCategory, IntentType } from '../interfaces';
import { HSE_PATTERNS } from '../seed';

describe('PatternLibraryService', () => {
  let service: PatternLibraryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PatternLibraryService],
    }).compile();

    service = module.get<PatternLibraryService>(PatternLibraryService);
    // CEDA is domain-agnostic - load HSE patterns for these tests
    service.loadPatterns(HSE_PATTERNS);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should start empty (domain-agnostic)', () => {
      const emptyService = new PatternLibraryService();
      expect(emptyService.getAllPatterns().length).toBe(0);
      expect(emptyService.hasPatterns()).toBe(false);
    });

    it('should have 5 patterns after loading HSE patterns', () => {
      const allPatterns = service.getAllPatterns();
      expect(allPatterns.length).toBe(5);
      expect(service.hasPatterns()).toBe(true);
    });

    it('should have one pattern per category after loading HSE', () => {
      const categories = Object.values(PatternCategory);
      for (const category of categories) {
        const patterns = service.getPatternsByCategory(category);
        expect(patterns.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('getPattern', () => {
    it('should return pattern by ID', () => {
      const pattern = service.getPattern('hse-assessment-default');
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe('hse-assessment-default');
      expect(pattern?.name).toBe('Safety Assessment');
    });

    it('should return undefined for non-existent pattern', () => {
      const pattern = service.getPattern('non-existent-id');
      expect(pattern).toBeUndefined();
    });
  });

  describe('getPatternsByCategory', () => {
    it('should return assessment patterns', () => {
      const patterns = service.getPatternsByCategory(PatternCategory.ASSESSMENT);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].category).toBe(PatternCategory.ASSESSMENT);
    });

    it('should return incident patterns', () => {
      const patterns = service.getPatternsByCategory(PatternCategory.INCIDENT);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].category).toBe(PatternCategory.INCIDENT);
    });

    it('should return permit patterns', () => {
      const patterns = service.getPatternsByCategory(PatternCategory.PERMIT);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].category).toBe(PatternCategory.PERMIT);
    });

    it('should return audit patterns', () => {
      const patterns = service.getPatternsByCategory(PatternCategory.AUDIT);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].category).toBe(PatternCategory.AUDIT);
    });

    it('should return action patterns', () => {
      const patterns = service.getPatternsByCategory(PatternCategory.ACTION);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].category).toBe(PatternCategory.ACTION);
    });
  });

  describe('matchPattern', () => {
    it('should match assessment pattern for safety assessment intent', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'safety assessment',
        entities: ['hazard', 'risk'],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.pattern.category).toBe(PatternCategory.ASSESSMENT);
      expect(match?.score).toBeGreaterThan(0.3);
    });

    it('should match incident pattern for incident report intent', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'incident report',
        entities: ['accident', 'injury'],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.pattern.category).toBe(PatternCategory.INCIDENT);
    });

    it('should match permit pattern for work permit intent', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'work permit',
        entities: ['hot work', 'confined space'],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.pattern.category).toBe(PatternCategory.PERMIT);
    });

    it('should match audit pattern for safety audit intent', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'safety audit inspection',
        entities: ['compliance', 'findings'],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.pattern.category).toBe(PatternCategory.AUDIT);
    });

    it('should match action pattern for corrective action intent', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'corrective action',
        entities: ['remediation', 'fix'],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.pattern.category).toBe(PatternCategory.ACTION);
    });

    it('should return null for low-scoring matches', () => {
      const classification = {
        intent: IntentType.QUERY,
        confidence: 0.5,
        domain: 'unknown domain xyz',
        entities: [],
      };
      const match = service.matchPattern(classification);
      expect(match).toBeNull();
    });

    it('should include matched rules in the result', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        domain: 'safety assessment',
        entities: [],
      };
      const match = service.matchPattern(classification);
      expect(match).not.toBeNull();
      expect(match?.matchedRules).toBeDefined();
      expect(match?.matchedRules.length).toBeGreaterThan(0);
    });
  });

  describe('getPatternStructure', () => {
    it('should return structure for valid pattern', () => {
      const structure = service.getPatternStructure('hse-assessment-default');
      expect(structure).toBeDefined();
      expect(structure?.sections.length).toBeGreaterThan(0);
    });

    it('should return undefined for invalid pattern', () => {
      const structure = service.getPatternStructure('non-existent');
      expect(structure).toBeUndefined();
    });

    it('should have required sections in assessment structure', () => {
      const structure = service.getPatternStructure('hse-assessment-default');
      expect(structure).toBeDefined();
      expect(structure?.sections).toContainEqual(
        expect.objectContaining({ name: 'General Information' }),
      );
      expect(structure?.sections).toContainEqual(
        expect.objectContaining({ name: 'Hazard Identification' }),
      );
      expect(structure?.sections).toContainEqual(
        expect.objectContaining({ name: 'Risk Evaluation' }),
      );
      expect(structure?.sections).toContainEqual(
        expect.objectContaining({ name: 'Control Measures' }),
      );
    });

    it('should have workflows defined in structure', () => {
      const structure = service.getPatternStructure('hse-assessment-default');
      expect(structure?.workflows).toBeDefined();
      expect(structure?.workflows.length).toBeGreaterThan(0);
    });

    it('should have default fields defined in structure', () => {
      const structure = service.getPatternStructure('hse-assessment-default');
      expect(structure?.defaultFields).toBeDefined();
      expect(structure?.defaultFields.length).toBeGreaterThan(0);
    });
  });

  describe('registerPattern', () => {
    it('should register a custom pattern', () => {
      const customPattern = {
        id: 'custom-pattern',
        name: 'Custom Pattern',
        category: PatternCategory.ASSESSMENT,
        description: 'A custom test pattern',
        structure: {
          sections: [
            { name: 'Test Section', fieldTypes: ['text'], required: true },
          ],
          workflows: ['test'],
          defaultFields: ['testField'],
        },
        applicabilityRules: [],
        confidenceFactors: [],
        metadata: {
          version: '1.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 0,
          successRate: 0,
        },
      };

      service.registerPattern(customPattern);
      const retrieved = service.getPattern('custom-pattern');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Custom Pattern');
    });

    it('should overwrite existing pattern with same ID', () => {
      const updatedPattern = {
        id: 'hse-assessment-default',
        name: 'Updated Assessment',
        category: PatternCategory.ASSESSMENT,
        description: 'Updated description',
        structure: {
          sections: [],
          workflows: [],
          defaultFields: [],
        },
        applicabilityRules: [],
        confidenceFactors: [],
        metadata: {
          version: '2.0.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          usageCount: 0,
          successRate: 0,
        },
      };

      service.registerPattern(updatedPattern);
      const retrieved = service.getPattern('hse-assessment-default');
      expect(retrieved?.name).toBe('Updated Assessment');
      expect(retrieved?.metadata.version).toBe('2.0.0');
    });
  });

  describe('getAllPatterns', () => {
    it('should return all registered patterns', () => {
      const patterns = service.getAllPatterns();
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBe(5);
    });
  });
});
