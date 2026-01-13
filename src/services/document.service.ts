/**
 * CEDA-47: Document Service
 *
 * Provides AI-native knowledge organization through document management.
 * Supports CRUD operations, linking, graph traversal, and semantic search.
 */

import { Injectable } from '@nestjs/common';
import {
  Document,
  DocumentType,
  DocumentLink,
  DocumentLinkType,
  CreateDocumentDto,
  UpdateDocumentDto,
  LinkDocumentDto,
  GraphQueryParams,
  DocumentGraph,
  GraphNode,
  GraphEdge,
  DocumentSearchParams,
  DocumentSearchResult,
} from '../interfaces';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class DocumentService {
  private documents: Map<string, Document> = new Map();

  constructor(private readonly embeddingService: EmbeddingService) {}

  /**
   * Create a new document with auto-generated embedding
   */
  async create(dto: CreateDocumentDto): Promise<Document> {
    const id = this.generateId();
    const now = new Date();

    const document: Document = {
      id,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      company: dto.company,
      project: dto.project,
      user: dto.user,
      tags: dto.tags || [],
      links: [],
      backlinks: [],
      createdAt: now,
      updatedAt: now,
    };

    const embedding = await this.generateEmbedding(document);
    if (embedding) {
      document.embedding = embedding;
    }

    this.documents.set(id, document);
    console.log(`[DocumentService] Created document: ${id} "${dto.title}"`);

    return document;
  }

  /**
   * Get a document by ID with access control
   */
  getById(id: string, company: string, user: string): Document | null {
    const document = this.documents.get(id);

    if (!document) {
      return null;
    }

    if (document.company !== company) {
      console.warn(`[DocumentService] Access denied: document ${id} belongs to different company`);
      return null;
    }

    return this.computeBacklinks(document);
  }

  /**
   * Update a document with auto-regenerated embedding
   */
  async update(id: string, dto: UpdateDocumentDto): Promise<Document | null> {
    const document = this.documents.get(id);

    if (!document) {
      return null;
    }

    if (document.company !== dto.company) {
      console.warn(`[DocumentService] Access denied: document ${id} belongs to different company`);
      return null;
    }

    const updated: Document = {
      ...document,
      title: dto.title ?? document.title,
      content: dto.content ?? document.content,
      tags: dto.tags ?? document.tags,
      updatedAt: new Date(),
    };

    if (dto.content !== undefined && dto.content !== document.content) {
      const embedding = await this.generateEmbedding(updated);
      if (embedding) {
        updated.embedding = embedding;
      }
    }

    this.documents.set(id, updated);
    console.log(`[DocumentService] Updated document: ${id}`);

    return this.computeBacklinks(updated);
  }

  /**
   * Delete a document and clean up all links
   */
  delete(id: string, company: string, user: string): boolean {
    const document = this.documents.get(id);

    if (!document) {
      return false;
    }

    if (document.company !== company) {
      console.warn(`[DocumentService] Access denied: document ${id} belongs to different company`);
      return false;
    }

    for (const doc of this.documents.values()) {
      doc.links = doc.links.filter(link => link.targetId !== id);
    }

    this.documents.delete(id);
    console.log(`[DocumentService] Deleted document: ${id}`);

    return true;
  }

  /**
   * Link two documents together
   */
  link(sourceId: string, dto: LinkDocumentDto): DocumentLink | null {
    const sourceDoc = this.documents.get(sourceId);
    const targetDoc = this.documents.get(dto.targetId);

    if (!sourceDoc || !targetDoc) {
      console.warn(`[DocumentService] Link failed: source or target document not found`);
      return null;
    }

    if (sourceDoc.company !== dto.company || targetDoc.company !== dto.company) {
      console.warn(`[DocumentService] Link failed: documents belong to different companies`);
      return null;
    }

    const existingLink = sourceDoc.links.find(
      link => link.targetId === dto.targetId && link.linkType === dto.linkType
    );
    if (existingLink) {
      console.warn(`[DocumentService] Link already exists: ${sourceId} -> ${dto.targetId}`);
      return existingLink;
    }

    const link: DocumentLink = {
      sourceId,
      targetId: dto.targetId,
      linkType: dto.linkType,
      createdAt: new Date(),
    };

    sourceDoc.links.push(link);
    this.documents.set(sourceId, sourceDoc);

    console.log(`[DocumentService] Linked: ${sourceId} -[${dto.linkType}]-> ${dto.targetId}`);

    return link;
  }

  /**
   * Remove a link between two documents
   */
  unlink(sourceId: string, targetId: string, company: string, user: string): boolean {
    const sourceDoc = this.documents.get(sourceId);

    if (!sourceDoc) {
      return false;
    }

    if (sourceDoc.company !== company) {
      console.warn(`[DocumentService] Unlink failed: document belongs to different company`);
      return false;
    }

    const initialLength = sourceDoc.links.length;
    sourceDoc.links = sourceDoc.links.filter(link => link.targetId !== targetId);

    if (sourceDoc.links.length === initialLength) {
      return false;
    }

    this.documents.set(sourceId, sourceDoc);
    console.log(`[DocumentService] Unlinked: ${sourceId} -> ${targetId}`);

    return true;
  }

  /**
   * Get all documents that link to a specific document (backlinks)
   */
  getBacklinks(id: string, company: string, user: string): Document[] {
    const document = this.documents.get(id);

    if (!document || document.company !== company) {
      return [];
    }

    const backlinks: Document[] = [];

    for (const doc of this.documents.values()) {
      if (doc.company !== company) continue;

      const hasLink = doc.links.some(link => link.targetId === id);
      if (hasLink) {
        backlinks.push(this.computeBacklinks(doc));
      }
    }

    return backlinks;
  }

  /**
   * Get document graph for a company with configurable depth
   */
  getGraph(params: GraphQueryParams): DocumentGraph {
    const { company, depth = 2, startId, user } = params;
    const nodes: Map<string, GraphNode> = new Map();
    const edges: GraphEdge[] = [];
    const visited: Set<string> = new Set();

    const addNode = (doc: Document): void => {
      if (!nodes.has(doc.id)) {
        nodes.set(doc.id, {
          id: doc.id,
          title: doc.title,
          type: doc.type,
          tags: doc.tags,
        });
      }
    };

    const traverse = (docId: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(docId)) {
        return;
      }

      visited.add(docId);
      const doc = this.documents.get(docId);

      if (!doc || doc.company !== company) {
        return;
      }

      addNode(doc);

      for (const link of doc.links) {
        const targetDoc = this.documents.get(link.targetId);
        if (targetDoc && targetDoc.company === company) {
          addNode(targetDoc);
          edges.push({
            source: link.sourceId,
            target: link.targetId,
            linkType: link.linkType,
          });
          traverse(link.targetId, currentDepth + 1);
        }
      }

      for (const otherDoc of this.documents.values()) {
        if (otherDoc.company !== company) continue;

        for (const link of otherDoc.links) {
          if (link.targetId === docId) {
            addNode(otherDoc);
            const edgeExists = edges.some(
              e => e.source === link.sourceId && e.target === link.targetId
            );
            if (!edgeExists) {
              edges.push({
                source: link.sourceId,
                target: link.targetId,
                linkType: link.linkType,
              });
            }
            traverse(otherDoc.id, currentDepth + 1);
          }
        }
      }
    };

    if (startId) {
      traverse(startId, 0);
    } else {
      for (const doc of this.documents.values()) {
        if (doc.company === company) {
          traverse(doc.id, 0);
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
      nodeCount: nodes.size,
      edgeCount: edges.length,
    };
  }

  /**
   * Search documents using semantic similarity
   */
  async search(params: DocumentSearchParams): Promise<DocumentSearchResult[]> {
    const { query, company, user, type, tags, limit = 20 } = params;

    if (this.embeddingService.isAvailable()) {
      return this.semanticSearch(params);
    }

    return this.keywordSearch(params);
  }

  /**
   * Get documents by tags
   */
  getByTags(company: string, user: string, tags: string[]): Document[] {
    const results: Document[] = [];

    for (const doc of this.documents.values()) {
      if (doc.company !== company) continue;

      const hasAllTags = tags.every(tag => doc.tags.includes(tag));
      if (hasAllTags) {
        results.push(this.computeBacklinks(doc));
      }
    }

    return results;
  }

  /**
   * Get all documents for a company
   */
  getAllForCompany(company: string, user: string): Document[] {
    const results: Document[] = [];

    for (const doc of this.documents.values()) {
      if (doc.company === company) {
        results.push(this.computeBacklinks(doc));
      }
    }

    return results;
  }

  /**
   * Get document count
   */
  getDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * Clear all documents (for testing)
   */
  clearDocuments(): void {
    this.documents.clear();
  }

  /**
   * Generate embedding for a document
   */
  private async generateEmbedding(document: Document): Promise<number[] | null> {
    if (!this.embeddingService.isAvailable()) {
      return null;
    }

    const textToEmbed = `${document.title}\n\n${document.content}\n\nTags: ${document.tags.join(', ')}`;

    try {
      return await this.embeddingService.generateEmbedding(textToEmbed);
    } catch (error) {
      console.error(`[DocumentService] Failed to generate embedding:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Semantic search using embeddings
   */
  private async semanticSearch(params: DocumentSearchParams): Promise<DocumentSearchResult[]> {
    const { query, company, user, type, tags, limit = 20 } = params;

    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      return this.keywordSearch(params);
    }

    const results: DocumentSearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (doc.company !== company) continue;
      if (type && doc.type !== type) continue;
      if (tags && tags.length > 0 && !tags.every(tag => doc.tags.includes(tag))) continue;

      if (doc.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({
          document: this.computeBacklinks(doc),
          score,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Keyword-based search fallback
   */
  private keywordSearch(params: DocumentSearchParams): DocumentSearchResult[] {
    const { query, company, user, type, tags, limit = 20 } = params;
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const results: DocumentSearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (doc.company !== company) continue;
      if (type && doc.type !== type) continue;
      if (tags && tags.length > 0 && !tags.every(tag => doc.tags.includes(tag))) continue;

      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 2;
        if (contentLower.includes(word)) score += 1;
        if (doc.tags.some(tag => tag.toLowerCase().includes(word))) score += 1;
      }

      if (score > 0) {
        const normalizedScore = Math.min(score / (queryWords.length * 4), 1);
        results.push({
          document: this.computeBacklinks(doc),
          score: normalizedScore,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Compute backlinks for a document
   */
  private computeBacklinks(document: Document): Document {
    const backlinks: DocumentLink[] = [];

    for (const doc of this.documents.values()) {
      for (const link of doc.links) {
        if (link.targetId === document.id) {
          backlinks.push(link);
        }
      }
    }

    return {
      ...document,
      backlinks,
    };
  }

  /**
   * Generate a unique document ID
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
