import { Test, TestingModule } from '@nestjs/testing';
import { PatternLibraryService, UserPatternQuery } from './pattern-library.service';
import { PatternCategory, IntentType, PatternScope } from '../interfaces';
import { HSE_PATTERNS, GOPRINT_PATTERNS, SPILNO_PATTERNS } from '../seed';

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

    it('should have one pattern per HSE category after loading HSE', () => {
      // HSE patterns only cover these 5 categories
      const hseCategories = [
        PatternCategory.ASSESSMENT,
        PatternCategory.INCIDENT,
        PatternCategory.PERMIT,
        PatternCategory.AUDIT,
        PatternCategory.ACTION,
      ];
      for (const category of hseCategories) {
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

  describe('CEDA-25: User-first pattern isolation', () => {
    describe('getPatternsForUser', () => {
      it('should return all global patterns for any user', () => {
        const query: UserPatternQuery = { user: 'user-123' };
        const patterns = service.getPatternsForUser(query);
        // HSE_PATTERNS are global by default (no scope set)
        expect(patterns.length).toBe(5);
      });

      it('should return user-scoped patterns only to the owning user', () => {
        const userPattern = {
          id: 'user-pattern-1',
          name: 'User Pattern',
          category: PatternCategory.ASSESSMENT,
          description: 'A user-specific pattern',
          scope: PatternScope.USER,
          user_id: 'user-123',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(userPattern);

        // Owner should see the pattern
        const ownerQuery: UserPatternQuery = { user: 'user-123' };
        const ownerPatterns = service.getPatternsForUser(ownerQuery);
        expect(ownerPatterns.some(p => p.id === 'user-pattern-1')).toBe(true);

        // Other user should NOT see the pattern
        const otherQuery: UserPatternQuery = { user: 'user-456' };
        const otherPatterns = service.getPatternsForUser(otherQuery);
        expect(otherPatterns.some(p => p.id === 'user-pattern-1')).toBe(false);
      });

      it('should return project-scoped patterns when project filter matches', () => {
        const projectPattern = {
          id: 'project-pattern-1',
          name: 'Project Pattern',
          category: PatternCategory.ASSESSMENT,
          description: 'A project-specific pattern',
          scope: PatternScope.PROJECT,
          project: 'project-abc',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(projectPattern);

        // User with matching project filter should see the pattern
        const matchingQuery: UserPatternQuery = { user: 'user-123', project: 'project-abc' };
        const matchingPatterns = service.getPatternsForUser(matchingQuery);
        expect(matchingPatterns.some(p => p.id === 'project-pattern-1')).toBe(true);

        // User with different project filter should NOT see the pattern
        const differentQuery: UserPatternQuery = { user: 'user-123', project: 'project-xyz' };
        const differentPatterns = service.getPatternsForUser(differentQuery);
        expect(differentPatterns.some(p => p.id === 'project-pattern-1')).toBe(false);
      });

      it('should return company-scoped patterns when company filter matches', () => {
        const companyPattern = {
          id: 'company-pattern-1',
          name: 'Company Pattern',
          category: PatternCategory.ASSESSMENT,
          description: 'A company-specific pattern',
          scope: PatternScope.COMPANY,
          company: 'company-abc',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(companyPattern);

        // User with matching company filter should see the pattern
        const matchingQuery: UserPatternQuery = { user: 'user-123', company: 'company-abc' };
        const matchingPatterns = service.getPatternsForUser(matchingQuery);
        expect(matchingPatterns.some(p => p.id === 'company-pattern-1')).toBe(true);

        // User with different company filter should NOT see the pattern
        const differentQuery: UserPatternQuery = { user: 'user-123', company: 'company-xyz' };
        const differentPatterns = service.getPatternsForUser(differentQuery);
        expect(differentPatterns.some(p => p.id === 'company-pattern-1')).toBe(false);
      });

      it('should support combined user, company, and project filters', () => {
        const query: UserPatternQuery = {
          user: 'user-123',
          company: 'company-abc',
          project: 'project-abc',
        };
        const patterns = service.getPatternsForUser(query);
        // Should include global patterns + any matching scoped patterns
        expect(patterns.length).toBeGreaterThanOrEqual(5);
      });
    });

    describe('isPatternAccessibleToUser', () => {
      it('should return true for accessible global patterns', () => {
        const query: UserPatternQuery = { user: 'user-123' };
        const accessible = service.isPatternAccessibleToUser('hse-assessment-default', query);
        expect(accessible).toBe(true);
      });

      it('should return false for non-existent patterns', () => {
        const query: UserPatternQuery = { user: 'user-123' };
        const accessible = service.isPatternAccessibleToUser('non-existent', query);
        expect(accessible).toBe(false);
      });

      it('should return false for user-scoped patterns owned by another user', () => {
        const userPattern = {
          id: 'private-pattern',
          name: 'Private Pattern',
          category: PatternCategory.ASSESSMENT,
          description: 'A private pattern',
          scope: PatternScope.USER,
          user_id: 'user-owner',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(userPattern);

        const query: UserPatternQuery = { user: 'user-other' };
        const accessible = service.isPatternAccessibleToUser('private-pattern', query);
        expect(accessible).toBe(false);
      });
    });

    describe('getPatternForUser', () => {
      it('should return pattern if accessible', () => {
        const query: UserPatternQuery = { user: 'user-123' };
        const pattern = service.getPatternForUser('hse-assessment-default', query);
        expect(pattern).toBeDefined();
        expect(pattern?.id).toBe('hse-assessment-default');
      });

      it('should return undefined if pattern not accessible', () => {
        const userPattern = {
          id: 'restricted-pattern',
          name: 'Restricted Pattern',
          category: PatternCategory.ASSESSMENT,
          description: 'A restricted pattern',
          scope: PatternScope.USER,
          user_id: 'user-owner',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(userPattern);

        const query: UserPatternQuery = { user: 'user-other' };
        const pattern = service.getPatternForUser('restricted-pattern', query);
        expect(pattern).toBeUndefined();
      });

      it('should return undefined for non-existent patterns', () => {
        const query: UserPatternQuery = { user: 'user-123' };
        const pattern = service.getPatternForUser('non-existent', query);
        expect(pattern).toBeUndefined();
      });
    });
  });

  describe('CEDA-31: Company pattern seeds', () => {
    describe('GoPrint patterns', () => {
      beforeEach(() => {
        service.loadPatterns(GOPRINT_PATTERNS);
      });

      it('should load 4 GoPrint patterns', () => {
        const allPatterns = service.getAllPatterns();
        const goprintPatterns = allPatterns.filter(p => p.company === 'goprint');
        expect(goprintPatterns.length).toBe(4);
      });

      it('should have Kiosk Session pattern', () => {
        const pattern = service.getPattern('goprint-session-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Kiosk Session');
        expect(pattern?.company).toBe('goprint');
        expect(pattern?.category).toBe(PatternCategory.SESSION);
      });

      it('should have Print Job pattern', () => {
        const pattern = service.getPattern('goprint-job-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Print Job');
        expect(pattern?.company).toBe('goprint');
        expect(pattern?.category).toBe(PatternCategory.JOB);
      });

      it('should have Kiosk Maintenance pattern', () => {
        const pattern = service.getPattern('goprint-maintenance-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Kiosk Maintenance');
        expect(pattern?.company).toBe('goprint');
        expect(pattern?.category).toBe(PatternCategory.MAINTENANCE);
      });

      it('should have Consumables Inventory pattern', () => {
        const pattern = service.getPattern('goprint-inventory-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Consumables Inventory');
        expect(pattern?.company).toBe('goprint');
        expect(pattern?.category).toBe(PatternCategory.INVENTORY);
      });

      it('should match session pattern for kiosk session intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'kiosk session print',
          entities: ['session', 'kiosk'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.SESSION);
      });

      it('should match job pattern for print job intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'print job document',
          entities: ['job', 'print'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.JOB);
      });

      it('should match maintenance pattern for kiosk maintenance intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'kiosk maintenance service',
          entities: ['maintenance', 'kiosk'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.MAINTENANCE);
      });

      it('should match inventory pattern for consumables inventory intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'consumables inventory supplies',
          entities: ['inventory', 'supplies'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.INVENTORY);
      });
    });

    describe('Spilno patterns', () => {
      beforeEach(() => {
        service.loadPatterns(SPILNO_PATTERNS);
      });

      it('should load 4 Spilno patterns', () => {
        const allPatterns = service.getAllPatterns();
        const spilnoPatterns = allPatterns.filter(p => p.company === 'spilno');
        expect(spilnoPatterns.length).toBe(4);
      });

      it('should have Collective Initiative pattern', () => {
        const pattern = service.getPattern('spilno-initiative-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Collective Initiative');
        expect(pattern?.company).toBe('spilno');
        expect(pattern?.category).toBe(PatternCategory.INITIATIVE);
      });

      it('should have Collective Decision pattern', () => {
        const pattern = service.getPattern('spilno-governance-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Collective Decision');
        expect(pattern?.company).toBe('spilno');
        expect(pattern?.category).toBe(PatternCategory.GOVERNANCE);
      });

      it('should have Resource Sharing pattern', () => {
        const pattern = service.getPattern('spilno-sharing-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Resource Sharing');
        expect(pattern?.company).toBe('spilno');
        expect(pattern?.category).toBe(PatternCategory.SHARING);
      });

      it('should have Trust Circle pattern', () => {
        const pattern = service.getPattern('spilno-trust-default');
        expect(pattern).toBeDefined();
        expect(pattern?.name).toBe('Trust Circle');
        expect(pattern?.company).toBe('spilno');
        expect(pattern?.category).toBe(PatternCategory.TRUST);
      });

      it('should match initiative pattern for collective initiative intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'initiative project proposal community',
          entities: ['initiative', 'project'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.INITIATIVE);
      });

      it('should match governance pattern for collective decision intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'decision vote governance consensus',
          entities: ['decision', 'vote'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.GOVERNANCE);
      });

      it('should match sharing pattern for resource sharing intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'resource sharing borrow',
          entities: ['sharing', 'resource'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.SHARING);
      });

      it('should match trust pattern for trust circle intent', () => {
        const classification = {
          intent: IntentType.CREATE,
          confidence: 0.9,
          domain: 'trust reputation circle',
          entities: ['trust', 'reputation'],
        };
        const match = service.matchPattern(classification);
        expect(match).not.toBeNull();
        expect(match?.pattern.category).toBe(PatternCategory.TRUST);
      });
    });

    describe('HSE patterns company field', () => {
      it('should have company=disrupt on all HSE patterns', () => {
        const hsePatterns = service.getAllPatterns().filter(p => p.id.startsWith('hse-'));
        expect(hsePatterns.length).toBe(5);
        for (const pattern of hsePatterns) {
          expect(pattern.company).toBe('disrupt');
        }
      });
    });

    describe('Company-based pattern filtering', () => {
      beforeEach(() => {
        service.loadPatterns(GOPRINT_PATTERNS);
        service.loadPatterns(SPILNO_PATTERNS);
      });

      it('should return goprint patterns when filtering by company=goprint', () => {
        const query: UserPatternQuery = { user: 'user-123', company: 'goprint' };
        const patterns = service.getPatternsForUser(query);
        
        // Should include goprint patterns (they don't have scope set, so they're global)
        // and HSE patterns (also global)
        const goprintPatterns = patterns.filter(p => p.company === 'goprint');
        expect(goprintPatterns.length).toBe(4);
      });

      it('should return spilno patterns when filtering by company=spilno', () => {
        const query: UserPatternQuery = { user: 'user-123', company: 'spilno' };
        const patterns = service.getPatternsForUser(query);
        
        // Should include spilno patterns
        const spilnoPatterns = patterns.filter(p => p.company === 'spilno');
        expect(spilnoPatterns.length).toBe(4);
      });

      it('should return disrupt patterns when filtering by company=disrupt', () => {
        const query: UserPatternQuery = { user: 'user-123', company: 'disrupt' };
        const patterns = service.getPatternsForUser(query);
        
        // Should include HSE patterns (company=disrupt)
        const disruptPatterns = patterns.filter(p => p.company === 'disrupt');
        expect(disruptPatterns.length).toBe(5);
      });

      it('should not have cross-company pattern leakage with COMPANY scope', () => {
        // Register a company-scoped pattern for goprint
        const goprintScopedPattern = {
          id: 'goprint-scoped-pattern',
          name: 'GoPrint Scoped Pattern',
          category: PatternCategory.SESSION,
          description: 'A company-scoped goprint pattern',
          scope: PatternScope.COMPANY,
          company: 'goprint',
          structure: {
            sections: [{ name: 'Test', fieldTypes: ['text'], required: true }],
            workflows: ['test'],
            defaultFields: ['id'],
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
        service.registerPattern(goprintScopedPattern);

        // User with goprint company should see the pattern
        const goprintQuery: UserPatternQuery = { user: 'user-123', company: 'goprint' };
        const goprintPatterns = service.getPatternsForUser(goprintQuery);
        expect(goprintPatterns.some(p => p.id === 'goprint-scoped-pattern')).toBe(true);

        // User with spilno company should NOT see the pattern
        const spilnoQuery: UserPatternQuery = { user: 'user-123', company: 'spilno' };
        const spilnoPatterns = service.getPatternsForUser(spilnoQuery);
        expect(spilnoPatterns.some(p => p.id === 'goprint-scoped-pattern')).toBe(false);

        // User with disrupt company should NOT see the pattern
        const disruptQuery: UserPatternQuery = { user: 'user-123', company: 'disrupt' };
        const disruptPatterns = service.getPatternsForUser(disruptQuery);
        expect(disruptPatterns.some(p => p.id === 'goprint-scoped-pattern')).toBe(false);
      });

      it('should load all 13 patterns (5 HSE + 4 GoPrint + 4 Spilno)', () => {
        const allPatterns = service.getAllPatterns();
        expect(allPatterns.length).toBe(13);
      });
    });
  });
});
