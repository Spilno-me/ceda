import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { EmbeddingService } from './embedding.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  LinkDocumentDto,
  DocumentSearchParams,
  GraphQueryParams,
} from '../interfaces';

describe('DocumentService', () => {
  let service: DocumentService;
  let embeddingService: EmbeddingService;

  const mockEmbeddingService = {
    isAvailable: jest.fn().mockReturnValue(false),
    generateEmbedding: jest.fn().mockResolvedValue(null),
  };

  const createTestDocument = (overrides: Partial<CreateDocumentDto> = {}): CreateDocumentDto => ({
    type: 'note',
    title: 'Test Document',
    content: 'This is test content',
    company: 'test-company',
    user: 'test-user',
    tags: ['test', 'document'],
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
  });

  afterEach(() => {
    service.clearDocuments();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a document with all required fields', async () => {
      const dto = createTestDocument();
      const document = await service.create(dto);

      expect(document).toBeDefined();
      expect(document.id).toBeDefined();
      expect(document.type).toBe(dto.type);
      expect(document.title).toBe(dto.title);
      expect(document.content).toBe(dto.content);
      expect(document.company).toBe(dto.company);
      expect(document.user).toBe(dto.user);
      expect(document.tags).toEqual(dto.tags);
      expect(document.links).toEqual([]);
      expect(document.backlinks).toEqual([]);
      expect(document.createdAt).toBeInstanceOf(Date);
      expect(document.updatedAt).toBeInstanceOf(Date);
    });

    it('should create documents with different types', async () => {
      const types = ['pattern', 'observation', 'session', 'insight', 'note'] as const;

      for (const type of types) {
        const dto = createTestDocument({ type, title: `${type} document` });
        const document = await service.create(dto);
        expect(document.type).toBe(type);
      }

      expect(service.getDocumentCount()).toBe(5);
    });

    it('should initialize tags as empty array if not provided', async () => {
      const dto = createTestDocument();
      delete (dto as Partial<CreateDocumentDto>).tags;
      const document = await service.create(dto);

      expect(document.tags).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should retrieve a document by ID with correct company', async () => {
      const dto = createTestDocument();
      const created = await service.create(dto);

      const retrieved = service.getById(created.id, dto.company, dto.user);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe(dto.title);
    });

    it('should return null for non-existent document', () => {
      const result = service.getById('non-existent-id', 'test-company', 'test-user');
      expect(result).toBeNull();
    });

    it('should return null when accessing document from different company', async () => {
      const dto = createTestDocument({ company: 'company-a' });
      const created = await service.create(dto);

      const result = service.getById(created.id, 'company-b', 'test-user');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update document title and content', async () => {
      const dto = createTestDocument();
      const created = await service.create(dto);

      const updateDto: UpdateDocumentDto = {
        title: 'Updated Title',
        content: 'Updated content',
        company: dto.company,
        user: dto.user,
      };

      const updated = await service.update(created.id, updateDto);

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.content).toBe('Updated content');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should update tags', async () => {
      const dto = createTestDocument({ tags: ['original'] });
      const created = await service.create(dto);

      const updateDto: UpdateDocumentDto = {
        tags: ['new', 'tags'],
        company: dto.company,
        user: dto.user,
      };

      const updated = await service.update(created.id, updateDto);

      expect(updated?.tags).toEqual(['new', 'tags']);
    });

    it('should return null when updating non-existent document', async () => {
      const updateDto: UpdateDocumentDto = {
        title: 'New Title',
        company: 'test-company',
        user: 'test-user',
      };

      const result = await service.update('non-existent-id', updateDto);
      expect(result).toBeNull();
    });

    it('should return null when updating document from different company', async () => {
      const dto = createTestDocument({ company: 'company-a' });
      const created = await service.create(dto);

      const updateDto: UpdateDocumentDto = {
        title: 'New Title',
        company: 'company-b',
        user: 'test-user',
      };

      const result = await service.update(created.id, updateDto);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a document', async () => {
      const dto = createTestDocument();
      const created = await service.create(dto);

      const deleted = service.delete(created.id, dto.company, dto.user);

      expect(deleted).toBe(true);
      expect(service.getById(created.id, dto.company, dto.user)).toBeNull();
      expect(service.getDocumentCount()).toBe(0);
    });

    it('should return false when deleting non-existent document', () => {
      const result = service.delete('non-existent-id', 'test-company', 'test-user');
      expect(result).toBe(false);
    });

    it('should return false when deleting document from different company', async () => {
      const dto = createTestDocument({ company: 'company-a' });
      const created = await service.create(dto);

      const result = service.delete(created.id, 'company-b', 'test-user');
      expect(result).toBe(false);
      expect(service.getDocumentCount()).toBe(1);
    });

    it('should clean up links when document is deleted', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      service.link(doc1.id, {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      service.delete(doc2.id, 'test-company', 'test-user');

      const updatedDoc1 = service.getById(doc1.id, 'test-company', 'test-user');
      expect(updatedDoc1?.links).toHaveLength(0);
    });
  });

  describe('link and unlink', () => {
    it('should link two documents', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      const linkDto: LinkDocumentDto = {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      };

      const link = service.link(doc1.id, linkDto);

      expect(link).toBeDefined();
      expect(link?.sourceId).toBe(doc1.id);
      expect(link?.targetId).toBe(doc2.id);
      expect(link?.linkType).toBe('references');

      const updatedDoc1 = service.getById(doc1.id, 'test-company', 'test-user');
      expect(updatedDoc1?.links).toHaveLength(1);
    });

    it('should support all link types', async () => {
      const linkTypes = ['references', 'related', 'parent', 'derived_from'] as const;
      const sourceDoc = await service.create(createTestDocument({ title: 'Source' }));

      for (const linkType of linkTypes) {
        const targetDoc = await service.create(createTestDocument({ title: `Target ${linkType}` }));
        const link = service.link(sourceDoc.id, {
          targetId: targetDoc.id,
          linkType,
          company: 'test-company',
          user: 'test-user',
        });
        expect(link?.linkType).toBe(linkType);
      }

      const updatedSource = service.getById(sourceDoc.id, 'test-company', 'test-user');
      expect(updatedSource?.links).toHaveLength(4);
    });

    it('should return existing link if already exists', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      const linkDto: LinkDocumentDto = {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      };

      const link1 = service.link(doc1.id, linkDto);
      const link2 = service.link(doc1.id, linkDto);

      expect(link1).toEqual(link2);

      const updatedDoc1 = service.getById(doc1.id, 'test-company', 'test-user');
      expect(updatedDoc1?.links).toHaveLength(1);
    });

    it('should unlink documents', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      service.link(doc1.id, {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      const unlinked = service.unlink(doc1.id, doc2.id, 'test-company', 'test-user');

      expect(unlinked).toBe(true);

      const updatedDoc1 = service.getById(doc1.id, 'test-company', 'test-user');
      expect(updatedDoc1?.links).toHaveLength(0);
    });

    it('should return false when unlinking non-existent link', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      const result = service.unlink(doc1.id, doc2.id, 'test-company', 'test-user');
      expect(result).toBe(false);
    });

    it('should return null when linking documents from different companies', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1', company: 'company-a' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2', company: 'company-b' }));

      const link = service.link(doc1.id, {
        targetId: doc2.id,
        linkType: 'references',
        company: 'company-a',
        user: 'test-user',
      });

      expect(link).toBeNull();
    });
  });

  describe('getBacklinks', () => {
    it('should return documents that link to a specific document', async () => {
      const target = await service.create(createTestDocument({ title: 'Target' }));
      const source1 = await service.create(createTestDocument({ title: 'Source 1' }));
      const source2 = await service.create(createTestDocument({ title: 'Source 2' }));

      service.link(source1.id, {
        targetId: target.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      service.link(source2.id, {
        targetId: target.id,
        linkType: 'related',
        company: 'test-company',
        user: 'test-user',
      });

      const backlinks = service.getBacklinks(target.id, 'test-company', 'test-user');

      expect(backlinks).toHaveLength(2);
      expect(backlinks.map(d => d.title)).toContain('Source 1');
      expect(backlinks.map(d => d.title)).toContain('Source 2');
    });

    it('should compute backlinks on retrieved documents', async () => {
      const target = await service.create(createTestDocument({ title: 'Target' }));
      const source = await service.create(createTestDocument({ title: 'Source' }));

      service.link(source.id, {
        targetId: target.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      const retrieved = service.getById(target.id, 'test-company', 'test-user');

      expect(retrieved?.backlinks).toHaveLength(1);
      expect(retrieved?.backlinks[0].sourceId).toBe(source.id);
    });
  });

  describe('getGraph', () => {
    it('should return document graph for a company', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));
      const doc3 = await service.create(createTestDocument({ title: 'Doc 3' }));

      service.link(doc1.id, {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      service.link(doc2.id, {
        targetId: doc3.id,
        linkType: 'related',
        company: 'test-company',
        user: 'test-user',
      });

      const params: GraphQueryParams = {
        company: 'test-company',
        user: 'test-user',
        depth: 2,
      };

      const graph = service.getGraph(params);

      expect(graph.nodeCount).toBe(3);
      expect(graph.edgeCount).toBe(2);
      expect(graph.nodes.map(n => n.title)).toContain('Doc 1');
      expect(graph.nodes.map(n => n.title)).toContain('Doc 2');
      expect(graph.nodes.map(n => n.title)).toContain('Doc 3');
    });

    it('should respect depth parameter', async () => {
      const doc1 = await service.create(createTestDocument({ title: 'Doc 1' }));
      const doc2 = await service.create(createTestDocument({ title: 'Doc 2' }));

      service.link(doc1.id, {
        targetId: doc2.id,
        linkType: 'references',
        company: 'test-company',
        user: 'test-user',
      });

      const params: GraphQueryParams = {
        company: 'test-company',
        user: 'test-user',
        depth: 1,
        startId: doc1.id,
      };

      const graph = service.getGraph(params);

      expect(graph.nodeCount).toBe(2);
      expect(graph.nodes.map(n => n.title)).toContain('Doc 1');
      expect(graph.nodes.map(n => n.title)).toContain('Doc 2');
    });

    it('should filter by company', async () => {
      await service.create(createTestDocument({ title: 'Company A Doc', company: 'company-a' }));
      await service.create(createTestDocument({ title: 'Company B Doc', company: 'company-b' }));

      const graph = service.getGraph({
        company: 'company-a',
        user: 'test-user',
      });

      expect(graph.nodeCount).toBe(1);
      expect(graph.nodes[0].title).toBe('Company A Doc');
    });
  });

  describe('search', () => {
    it('should search documents by keyword', async () => {
      await service.create(createTestDocument({ title: 'Safety Assessment', content: 'HSE safety procedures' }));
      await service.create(createTestDocument({ title: 'Incident Report', content: 'Workplace incident' }));
      await service.create(createTestDocument({ title: 'Training Manual', content: 'Safety training guide' }));

      const params: DocumentSearchParams = {
        query: 'safety',
        company: 'test-company',
        user: 'test-user',
      };

      const results = await service.search(params);

      expect(results.length).toBe(2);
      expect(results.every(r => r.score > 0)).toBe(true);
    });

    it('should filter search by document type', async () => {
      await service.create(createTestDocument({ type: 'note', title: 'Note about safety' }));
      await service.create(createTestDocument({ type: 'insight', title: 'Safety insight' }));

      const params: DocumentSearchParams = {
        query: 'safety',
        company: 'test-company',
        user: 'test-user',
        type: 'note',
      };

      const results = await service.search(params);

      expect(results.length).toBe(1);
      expect(results[0].document.type).toBe('note');
    });

    it('should filter search by tags', async () => {
      await service.create(createTestDocument({ title: 'Tagged Doc', tags: ['important', 'safety'] }));
      await service.create(createTestDocument({ title: 'Other Doc', tags: ['general'] }));

      const params: DocumentSearchParams = {
        query: 'doc',
        company: 'test-company',
        user: 'test-user',
        tags: ['important'],
      };

      const results = await service.search(params);

      expect(results.length).toBe(1);
      expect(results[0].document.title).toBe('Tagged Doc');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await service.create(createTestDocument({ title: `Test Document ${i}` }));
      }

      const params: DocumentSearchParams = {
        query: 'test',
        company: 'test-company',
        user: 'test-user',
        limit: 5,
      };

      const results = await service.search(params);

      expect(results.length).toBe(5);
    });
  });

  describe('getByTags', () => {
    it('should return documents matching all specified tags', async () => {
      await service.create(createTestDocument({ title: 'Doc 1', tags: ['safety', 'hse'] }));
      await service.create(createTestDocument({ title: 'Doc 2', tags: ['safety'] }));
      await service.create(createTestDocument({ title: 'Doc 3', tags: ['hse', 'training'] }));

      const results = service.getByTags('test-company', 'test-user', ['safety', 'hse']);

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Doc 1');
    });

    it('should return empty array when no documents match tags', () => {
      const results = service.getByTags('test-company', 'test-user', ['nonexistent']);
      expect(results).toEqual([]);
    });
  });

  describe('getAllForCompany', () => {
    it('should return all documents for a company', async () => {
      await service.create(createTestDocument({ title: 'Doc 1', company: 'company-a' }));
      await service.create(createTestDocument({ title: 'Doc 2', company: 'company-a' }));
      await service.create(createTestDocument({ title: 'Doc 3', company: 'company-b' }));

      const results = service.getAllForCompany('company-a', 'test-user');

      expect(results.length).toBe(2);
      expect(results.every(d => d.company === 'company-a')).toBe(true);
    });
  });

  describe('document count and clear', () => {
    it('should track document count', async () => {
      expect(service.getDocumentCount()).toBe(0);

      await service.create(createTestDocument({ title: 'Doc 1' }));
      expect(service.getDocumentCount()).toBe(1);

      await service.create(createTestDocument({ title: 'Doc 2' }));
      expect(service.getDocumentCount()).toBe(2);
    });

    it('should clear all documents', async () => {
      await service.create(createTestDocument({ title: 'Doc 1' }));
      await service.create(createTestDocument({ title: 'Doc 2' }));

      service.clearDocuments();

      expect(service.getDocumentCount()).toBe(0);
    });
  });
});
