import { Test, TestingModule } from '@nestjs/testing';
import { LinkingService } from './linking.service';
import { PatternLibraryService } from './pattern-library.service';
import { ObservationService } from './observation.service';
import { EmbeddingService } from './embedding.service';
import {
  Pattern,
  PatternCategory,
  Observation,
  ObservationOutcome,
  LinkType,
} from '../interfaces';

describe('LinkingService', () => {
  let service: LinkingService;
  let patternLibrary: PatternLibraryService;
  let observationService: ObservationService;

  const mockPattern: Pattern = {
    id: 'test-pattern-1',
    name: 'Test Pattern',
    category: PatternCategory.ASSESSMENT,
    description: 'A test pattern for unit testing',
    structure: {
      sections: [],
      workflows: ['draft', 'review'],
      defaultFields: ['id', 'createdAt'],
    },
    applicabilityRules: [],
    confidenceFactors: [],
    metadata: {
      version: '1.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      successRate: 0,
    },
  };

  const mockObservation: Observation = {
    id: 'test-observation-1',
    sessionId: 'session-1',
    company: 'test-company',
    project: 'test-project',
    user: 'test-user',
    patternId: 'test-pattern-1',
    patternName: 'Test Pattern',
    prediction: {
      moduleType: 'assessment',
      sections: [],
      confidence: 0.85,
      rationale: 'Test prediction',
      alternatives: [],
    },
    outcome: 'accepted' as ObservationOutcome,
    modifications: [],
    input: 'create a test assessment',
    confidence: 0.85,
    processingTime: 100,
    timestamp: new Date(),
    source: 'direct',
  };

  const mockEmbeddingService = {
    isAvailable: jest.fn().mockReturnValue(false),
    generateEmbedding: jest.fn().mockResolvedValue(null),
    getEmbeddingDimensions: jest.fn().mockReturnValue(1536),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkingService,
        PatternLibraryService,
        {
          provide: ObservationService,
          useValue: {
            getObservation: jest.fn().mockImplementation((id: string) => {
              if (id === mockObservation.id) {
                return Promise.resolve(mockObservation);
              }
              return Promise.resolve(null);
            }),
          },
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    service = module.get<LinkingService>(LinkingService);
    patternLibrary = module.get<PatternLibraryService>(PatternLibraryService);
    observationService = module.get<ObservationService>(ObservationService);

    patternLibrary.registerPattern(mockPattern);
  });

  afterEach(() => {
    service.clearAll();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('wrapPattern', () => {
    it('should wrap a pattern as a linkable node', () => {
      const result = service.wrapPattern(mockPattern.id, 'test-company', 'test-user');

      expect(result.wrapped).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.node).toBeDefined();
      expect(result.node.type).toBe('pattern');
      expect(result.node.entityId).toBe(mockPattern.id);
      expect(result.node.company).toBe('test-company');
      expect(result.node.user).toBe('test-user');
      expect(result.node.name).toBe(mockPattern.name);
      expect(result.node.links).toEqual([]);
      expect(result.node.backlinks).toEqual([]);
    });

    it('should return existing node if pattern already wrapped', () => {
      const firstResult = service.wrapPattern(mockPattern.id, 'test-company', 'test-user');
      const secondResult = service.wrapPattern(mockPattern.id, 'test-company', 'test-user');

      expect(firstResult.isNew).toBe(true);
      expect(secondResult.isNew).toBe(false);
      expect(secondResult.wrapped).toBe(true);
      expect(secondResult.node.id).toBe(firstResult.node.id);
    });

    it('should throw error for non-existent pattern', () => {
      expect(() => {
        service.wrapPattern('non-existent-pattern', 'test-company', 'test-user');
      }).toThrow('Pattern not found: non-existent-pattern');
    });

    it('should use custom name and description when provided', () => {
      const result = service.wrapPattern(mockPattern.id, 'test-company', 'test-user', {
        name: 'Custom Name',
        description: 'Custom description',
      });

      expect(result.node.name).toBe('Custom Name');
      expect(result.node.description).toBe('Custom description');
    });
  });

  describe('wrapObservation', () => {
    it('should wrap an observation as a linkable node', async () => {
      const result = await service.wrapObservation(mockObservation.id, 'test-company', 'test-user');

      expect(result.wrapped).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.node).toBeDefined();
      expect(result.node.type).toBe('observation');
      expect(result.node.entityId).toBe(mockObservation.id);
      expect(result.node.company).toBe('test-company');
    });

    it('should return existing node if observation already wrapped', async () => {
      const firstResult = await service.wrapObservation(mockObservation.id, 'test-company', 'test-user');
      const secondResult = await service.wrapObservation(mockObservation.id, 'test-company', 'test-user');

      expect(firstResult.isNew).toBe(true);
      expect(secondResult.isNew).toBe(false);
      expect(secondResult.wrapped).toBe(true);
    });

    it('should throw error for non-existent observation', async () => {
      await expect(
        service.wrapObservation('non-existent-observation', 'test-company', 'test-user')
      ).rejects.toThrow('Observation not found: non-existent-observation');
    });

    it('should deny access for different company', async () => {
      await expect(
        service.wrapObservation(mockObservation.id, 'different-company', 'test-user')
      ).rejects.toThrow('Access denied: observation belongs to different company');
    });
  });

  describe('linkObservationToPattern', () => {
    it('should create a bidirectional link between observation and pattern', async () => {
      const result = await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      expect(result.linked).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.link).toBeDefined();
      expect(result.link.linkType).toBe('derived_from');
    });

    it('should return existing link if already linked', async () => {
      const firstResult = await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      const secondResult = await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      expect(firstResult.isNew).toBe(true);
      expect(secondResult.isNew).toBe(false);
      expect(secondResult.link.id).toBe(firstResult.link.id);
    });

    it('should support different link types', async () => {
      const linkTypes: LinkType[] = ['derived_from', 'supports', 'contradicts', 'related', 'refines'];

      for (const linkType of linkTypes) {
        service.clearAll();
        const result = await service.linkObservationToPattern(
          mockObservation.id,
          mockPattern.id,
          linkType,
          'test-company',
          'test-user'
        );
        expect(result.link.linkType).toBe(linkType);
      }
    });

    it('should support optional weight and metadata', async () => {
      const result = await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'supports',
        'test-company',
        'test-user',
        0.9,
        { reason: 'Strong correlation' }
      );

      expect(result.link.weight).toBe(0.9);
      expect(result.link.metadata).toEqual({ reason: 'Strong correlation' });
    });
  });

  describe('getPatternNetwork', () => {
    it('should return empty network for unwrapped pattern', () => {
      const network = service.getPatternNetwork(mockPattern.id, 2, 'test-company', 'test-user');

      expect(network.nodes).toHaveLength(0);
      expect(network.edges).toHaveLength(0);
      expect(network.nodeCount).toBe(0);
      expect(network.edgeCount).toBe(0);
    });

    it('should return network with single node for wrapped pattern without links', () => {
      service.wrapPattern(mockPattern.id, 'test-company', 'test-user');

      const network = service.getPatternNetwork(mockPattern.id, 2, 'test-company', 'test-user');

      expect(network.nodes).toHaveLength(1);
      expect(network.edges).toHaveLength(0);
      expect(network.nodes[0].entityId).toBe(mockPattern.id);
      expect(network.nodes[0].type).toBe('pattern');
    });

    it('should return network with connected nodes', async () => {
      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      const network = service.getPatternNetwork(mockPattern.id, 2, 'test-company', 'test-user');

      expect(network.nodes.length).toBeGreaterThanOrEqual(1);
      expect(network.rootId).toContain(mockPattern.id);
    });

    it('should respect depth parameter', async () => {
      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      const shallowNetwork = service.getPatternNetwork(mockPattern.id, 0, 'test-company', 'test-user');
      const deepNetwork = service.getPatternNetwork(mockPattern.id, 5, 'test-company', 'test-user');

      expect(shallowNetwork.depth).toBe(0);
      expect(deepNetwork.depth).toBe(5);
    });

    it('should filter by link types when specified', async () => {
      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      const filteredNetwork = service.getPatternNetwork(
        mockPattern.id,
        2,
        'test-company',
        'test-user',
        ['supports']
      );

      expect(filteredNetwork.edges.every(e => e.linkType === 'supports')).toBe(true);
    });
  });

  describe('getRelatedPatterns', () => {
    it('should return empty array for pattern without links', () => {
      service.wrapPattern(mockPattern.id, 'test-company', 'test-user');

      const related = service.getRelatedPatterns(mockPattern.id, 'test-company', 'test-user');

      expect(related).toEqual([]);
    });

    it('should return empty array for unwrapped pattern', () => {
      const related = service.getRelatedPatterns(mockPattern.id, 'test-company', 'test-user');

      expect(related).toEqual([]);
    });
  });

  describe('access control', () => {
    it('should deny access to pattern node from different company', () => {
      service.wrapPattern(mockPattern.id, 'company-a', 'user-a');

      const result = service.wrapPattern(mockPattern.id, 'company-b', 'user-b');

      expect(result.wrapped).toBe(false);
    });

    it('should deny access to observation node from different company', async () => {
      await service.wrapObservation(mockObservation.id, 'test-company', 'test-user');

      const result = await service.wrapObservation(mockObservation.id, 'different-company', 'test-user');

      expect(result.wrapped).toBe(false);
    });

    it('should filter network by company', async () => {
      service.wrapPattern(mockPattern.id, 'company-a', 'user-a');

      const networkA = service.getPatternNetwork(mockPattern.id, 2, 'company-a', 'user-a');
      const networkB = service.getPatternNetwork(mockPattern.id, 2, 'company-b', 'user-b');

      expect(networkA.nodes).toHaveLength(1);
      expect(networkB.nodes).toHaveLength(0);
    });
  });

  describe('getNode', () => {
    it('should return node with computed backlinks', async () => {
      const patternResult = service.wrapPattern(mockPattern.id, 'test-company', 'test-user');
      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      const node = service.getNode(patternResult.node.id, 'test-company', 'test-user');

      expect(node).toBeDefined();
      expect(node?.backlinks).toHaveLength(1);
      expect(node?.backlinks[0].linkType).toBe('derived_from');
    });

    it('should return null for non-existent node', () => {
      const node = service.getNode('non-existent-node', 'test-company', 'test-user');

      expect(node).toBeNull();
    });

    it('should return null for node from different company', () => {
      const result = service.wrapPattern(mockPattern.id, 'company-a', 'user-a');

      const node = service.getNode(result.node.id, 'company-b', 'user-b');

      expect(node).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track node count', async () => {
      expect(service.getNodeCount()).toBe(0);

      service.wrapPattern(mockPattern.id, 'test-company', 'test-user');
      expect(service.getNodeCount()).toBe(1);

      await service.wrapObservation(mockObservation.id, 'test-company', 'test-user');
      expect(service.getNodeCount()).toBe(2);
    });

    it('should track link count', async () => {
      expect(service.getLinkCount()).toBe(0);

      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      expect(service.getLinkCount()).toBe(1);
    });

    it('should clear all nodes and links', async () => {
      service.wrapPattern(mockPattern.id, 'test-company', 'test-user');
      await service.linkObservationToPattern(
        mockObservation.id,
        mockPattern.id,
        'derived_from',
        'test-company',
        'test-user'
      );

      expect(service.getNodeCount()).toBeGreaterThan(0);
      expect(service.getLinkCount()).toBeGreaterThan(0);

      service.clearAll();

      expect(service.getNodeCount()).toBe(0);
      expect(service.getLinkCount()).toBe(0);
    });
  });
});
