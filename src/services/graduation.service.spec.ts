import { Test, TestingModule } from '@nestjs/testing';
import { GraduationService } from './graduation.service';
import { PatternLibraryService } from './pattern-library.service';
import { ObservationService } from './observation.service';
import { EmbeddingService } from './embedding.service';
import {
  Pattern,
  PatternCategory,
  PatternLevel,
  Observation,
  ObservationOutcome,
} from '../interfaces';

describe('GraduationService', () => {
  let service: GraduationService;
  let patternLibrary: PatternLibraryService;
  let observationService: ObservationService;

  const createTestPattern = (
    id: string,
    level: PatternLevel = PatternLevel.OBSERVATION,
    company?: string,
  ): Pattern => ({
    id,
    name: `Test Pattern ${id}`,
    category: PatternCategory.ASSESSMENT,
    description: 'A test pattern',
    level,
    company,
    structure: {
      sections: [
        { name: 'General Information', fieldTypes: ['text', 'date'], required: true },
        { name: 'Company Details', fieldTypes: ['employee_id', 'company_name'], required: false },
      ],
      workflows: ['draft', 'review', 'approve'],
      defaultFields: ['id', 'createdAt', 'status'],
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
  });

  const createTestObservation = (
    patternId: string,
    outcome: ObservationOutcome,
    user: string,
    company: string,
  ): Observation => ({
    id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sessionId: `session_${Date.now()}`,
    company,
    project: 'test-project',
    user,
    patternId,
    patternName: `Test Pattern ${patternId}`,
    prediction: {
      moduleType: 'assessment',
      sections: [],
      confidence: 0.85,
      rationale: 'Test prediction',
      alternatives: [],
    },
    outcome,
    modifications: [],
    input: 'Test input',
    confidence: 0.85,
    processingTime: 100,
    timestamp: new Date(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraduationService,
        PatternLibraryService,
        ObservationService,
        {
          provide: EmbeddingService,
          useValue: {
            isAvailable: () => false,
            generateEmbedding: async () => null,
            getEmbeddingDimensions: () => 1536,
          },
        },
      ],
    }).compile();

    service = module.get<GraduationService>(GraduationService);
    patternLibrary = module.get<PatternLibraryService>(PatternLibraryService);
    observationService = module.get<ObservationService>(ObservationService);
  });

  afterEach(() => {
    patternLibrary.clearPatterns();
    observationService.clearObservations();
    service.clearPendingApprovals();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkGraduation', () => {
    it('should return canGraduate: false for non-existent pattern', async () => {
      const result = await service.checkGraduation('non-existent');
      expect(result.canGraduate).toBe(false);
      expect(result.reason).toContain('Pattern not found');
    });

    it('should return canGraduate: false for pattern already at SHARED level', async () => {
      const pattern = createTestPattern('shared-pattern', PatternLevel.SHARED);
      patternLibrary.registerPattern(pattern);

      const result = await service.checkGraduation('shared-pattern');
      expect(result.canGraduate).toBe(false);
      expect(result.reason).toContain('maximum level');
    });

    describe('Observation -> Local graduation', () => {
      it('should not graduate with insufficient observations', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
        patternLibrary.registerPattern(pattern);

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(false);
        expect(result.reason).toContain('observations');
      });

      it('should not graduate with low acceptance rate', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
        patternLibrary.registerPattern(pattern);

        // Add 3 observations with only 1 accepted (33% acceptance)
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs1',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs2',
          createTestObservation('test-pattern', 'rejected', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs3',
          createTestObservation('test-pattern', 'rejected', 'user1', 'company1'),
        );

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(false);
        expect(result.reason).toContain('acceptance rate');
      });

      it('should graduate with sufficient observations and acceptance rate', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
        patternLibrary.registerPattern(pattern);

        // Add 3 observations with 3 accepted (100% acceptance)
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs1',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs2',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs3',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(true);
        expect(result.toLevel).toBe(PatternLevel.LOCAL);
      });
    });

    describe('Local -> Company graduation', () => {
      it('should not graduate with insufficient unique users', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.LOCAL);
        patternLibrary.registerPattern(pattern);

        // Add observations from only 2 users
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs1',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs2',
          createTestObservation('test-pattern', 'accepted', 'user2', 'company1'),
        );

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(false);
        expect(result.reason).toContain('unique users');
      });

      it('should graduate with sufficient users and acceptance rate', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.LOCAL);
        patternLibrary.registerPattern(pattern);

        // Add observations from 5 different users
        for (let i = 1; i <= 5; i++) {
          (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
            `obs${i}`,
            createTestObservation('test-pattern', 'accepted', `user${i}`, 'company1'),
          );
        }

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(true);
        expect(result.toLevel).toBe(PatternLevel.COMPANY);
        expect(result.requiresApproval).toBe(false);
      });
    });

    describe('Company -> Shared graduation', () => {
      it('should not graduate with insufficient unique companies', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY);
        patternLibrary.registerPattern(pattern);

        // Add observations from only 2 companies
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs1',
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          'obs2',
          createTestObservation('test-pattern', 'accepted', 'user2', 'company2'),
        );

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(false);
        expect(result.reason).toContain('unique companies');
      });

      it('should require admin approval for shared graduation', async () => {
        const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY);
        patternLibrary.registerPattern(pattern);

        // Add observations from 3 different companies with high acceptance
        for (let i = 1; i <= 3; i++) {
          (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
            `obs${i}`,
            createTestObservation('test-pattern', 'accepted', `user${i}`, `company${i}`),
          );
        }

        const result = await service.checkGraduation('test-pattern');
        expect(result.canGraduate).toBe(true);
        expect(result.toLevel).toBe(PatternLevel.SHARED);
        expect(result.requiresApproval).toBe(true);
      });
    });
  });

  describe('graduate', () => {
    it('should return null for non-existent pattern', async () => {
      const result = await service.graduate('non-existent', PatternLevel.LOCAL);
      expect(result).toBeNull();
    });

    it('should not allow graduating to lower or same level', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.LOCAL);
      patternLibrary.registerPattern(pattern);

      const result = await service.graduate('test-pattern', PatternLevel.OBSERVATION);
      expect(result).toBeNull();
    });

    it('should not allow skipping levels', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      const result = await service.graduate('test-pattern', PatternLevel.COMPANY);
      expect(result).toBeNull();
    });

    it('should graduate pattern to next level', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      const result = await service.graduate('test-pattern', PatternLevel.LOCAL);
      expect(result).not.toBeNull();
      expect(result?.level).toBe(PatternLevel.LOCAL);
      expect(result?.graduatedAt).toBeDefined();
    });

    it('should anonymize pattern when graduating to SHARED', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY, 'test-company');
      patternLibrary.registerPattern(pattern);

      const result = await service.graduate('test-pattern', PatternLevel.SHARED);
      expect(result).not.toBeNull();
      expect(result?.level).toBe(PatternLevel.SHARED);
      expect(result?.company).toBe('*');
    });
  });

  describe('anonymize', () => {
    it('should anonymize company-specific field names', () => {
      const structure = {
        sections: [
          { name: 'Company Information', fieldTypes: ['company_name', 'employee_id'], required: true },
          { name: 'Internal Data', fieldTypes: ['internal_code'], required: false },
        ],
        workflows: ['draft', 'review'],
        defaultFields: ['id'],
      };

      const anonymized = service.anonymize(structure);

      // Company-specific section names should be generalized
      expect(anonymized.sections[0].name).toBe('Section 1');
      expect(anonymized.sections[1].name).toBe('Section 2');

      // Field types should be normalized
      expect(anonymized.sections[0].fieldTypes).toContain('name');
      expect(anonymized.sections[0].fieldTypes).toContain('identifier');
      expect(anonymized.sections[1].fieldTypes).toContain('code');
    });

    it('should preserve non-company-specific names', () => {
      const structure = {
        sections: [
          { name: 'General Information', fieldTypes: ['text', 'date'], required: true },
        ],
        workflows: ['draft'],
        defaultFields: ['id'],
      };

      const anonymized = service.anonymize(structure);
      expect(anonymized.sections[0].name).toBe('General Information');
    });
  });

  describe('getGraduationStatus', () => {
    it('should return null for non-existent pattern', async () => {
      const status = await service.getGraduationStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should return status with progress information', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      // Add 1 observation (need 3 for graduation)
      (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
        'obs1',
        createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
      );

      const status = await service.getGraduationStatus('test-pattern');
      expect(status).not.toBeNull();
      expect(status?.currentLevel).toBe(PatternLevel.OBSERVATION);
      expect(status?.canGraduate).toBe(false);
      expect(status?.progress).toBeGreaterThan(0);
      expect(status?.progress).toBeLessThan(1);
      expect(status?.missingCriteria).toBeDefined();
      expect(status?.missingCriteria?.length).toBeGreaterThan(0);
    });

    it('should show canGraduate: true when criteria are met', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      // Add 3 accepted observations
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
      }

      const status = await service.getGraduationStatus('test-pattern');
      expect(status?.canGraduate).toBe(true);
      expect(status?.nextLevel).toBe(PatternLevel.LOCAL);
    });
  });

  describe('getGraduationCandidates', () => {
    it('should return empty array when no patterns can graduate', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      const candidates = await service.getGraduationCandidates();
      expect(candidates).toEqual([]);
    });

    it('should return patterns that can graduate', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      // Add 3 accepted observations
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
      }

      const candidates = await service.getGraduationCandidates();
      expect(candidates.length).toBe(1);
      expect(candidates[0].patternId).toBe('test-pattern');
      expect(candidates[0].targetLevel).toBe(PatternLevel.LOCAL);
    });

    it('should filter by target level', async () => {
      const pattern1 = createTestPattern('pattern1', PatternLevel.OBSERVATION);
      const pattern2 = createTestPattern('pattern2', PatternLevel.LOCAL);
      patternLibrary.registerPattern(pattern1);
      patternLibrary.registerPattern(pattern2);

      // Add observations for pattern1 to graduate to LOCAL
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs1_${i}`,
          createTestObservation('pattern1', 'accepted', 'user1', 'company1'),
        );
      }

      // Add observations for pattern2 to graduate to COMPANY
      for (let i = 1; i <= 5; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs2_${i}`,
          createTestObservation('pattern2', 'accepted', `user${i}`, 'company1'),
        );
      }

      const localCandidates = await service.getGraduationCandidates(PatternLevel.LOCAL);
      expect(localCandidates.length).toBe(1);
      expect(localCandidates[0].patternId).toBe('pattern1');

      const companyCandidates = await service.getGraduationCandidates(PatternLevel.COMPANY);
      expect(companyCandidates.length).toBe(1);
      expect(companyCandidates[0].patternId).toBe('pattern2');
    });
  });

  describe('approveGraduation', () => {
    it('should fail for non-existent pattern', async () => {
      const result = await service.approveGraduation('non-existent', 'admin1');
      expect(result.success).toBe(false);
    });

    it('should fail for pattern not at COMPANY level', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.LOCAL);
      patternLibrary.registerPattern(pattern);

      const result = await service.approveGraduation('test-pattern', 'admin1');
      expect(result.success).toBe(false);
    });

    it('should fail if pattern does not meet criteria', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY);
      patternLibrary.registerPattern(pattern);

      // No observations - doesn't meet criteria
      const result = await service.approveGraduation('test-pattern', 'admin1');
      expect(result.success).toBe(false);
    });

    it('should graduate pattern to SHARED with anonymization', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY, 'test-company');
      patternLibrary.registerPattern(pattern);

      // Add observations from 3 companies
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', `user${i}`, `company${i}`),
        );
      }

      const result = await service.approveGraduation('test-pattern', 'admin1', 'Approved for sharing');
      expect(result.success).toBe(true);
      expect(result.newLevel).toBe(PatternLevel.SHARED);
      expect(result.anonymized).toBe(true);

      // Verify pattern was updated
      const updatedPattern = patternLibrary.getPattern('test-pattern');
      expect(updatedPattern?.level).toBe(PatternLevel.SHARED);
      expect(updatedPattern?.company).toBe('*');
    });
  });

  describe('checkAllGraduations', () => {
    it('should auto-graduate patterns that meet criteria (except SHARED)', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.OBSERVATION);
      patternLibrary.registerPattern(pattern);

      // Add 3 accepted observations
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', 'user1', 'company1'),
        );
      }

      const result = await service.checkAllGraduations();
      expect(result.graduated).toContain('test-pattern');
      expect(result.pendingApproval).not.toContain('test-pattern');

      // Verify pattern was graduated
      const updatedPattern = patternLibrary.getPattern('test-pattern');
      expect(updatedPattern?.level).toBe(PatternLevel.LOCAL);
    });

    it('should add COMPANY -> SHARED candidates to pending approval', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY);
      patternLibrary.registerPattern(pattern);

      // Add observations from 3 companies
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', `user${i}`, `company${i}`),
        );
      }

      const result = await service.checkAllGraduations();
      expect(result.graduated).not.toContain('test-pattern');
      expect(result.pendingApproval).toContain('test-pattern');

      // Verify pattern was NOT graduated (needs approval)
      const updatedPattern = patternLibrary.getPattern('test-pattern');
      expect(updatedPattern?.level).toBe(PatternLevel.COMPANY);

      // Verify it's in pending approvals
      const pending = service.getPendingApprovals();
      expect(pending.some(p => p.patternId === 'test-pattern')).toBe(true);
    });

    it('should skip patterns already at SHARED level', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.SHARED);
      patternLibrary.registerPattern(pattern);

      const result = await service.checkAllGraduations();
      expect(result.graduated).not.toContain('test-pattern');
      expect(result.pendingApproval).not.toContain('test-pattern');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return empty array initially', () => {
      const pending = service.getPendingApprovals();
      expect(pending).toEqual([]);
    });

    it('should return pending approvals after checkAllGraduations', async () => {
      const pattern = createTestPattern('test-pattern', PatternLevel.COMPANY);
      patternLibrary.registerPattern(pattern);

      // Add observations from 3 companies
      for (let i = 1; i <= 3; i++) {
        (observationService as unknown as { observations: Map<string, Observation> }).observations.set(
          `obs${i}`,
          createTestObservation('test-pattern', 'accepted', `user${i}`, `company${i}`),
        );
      }

      await service.checkAllGraduations();

      const pending = service.getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].patternId).toBe('test-pattern');
      expect(pending[0].targetLevel).toBe(PatternLevel.SHARED);
    });
  });
});
