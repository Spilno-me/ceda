import { Injectable } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { VectorStoreService } from './vector-store.service';

export interface TenantEmbeddingContext {
  tenantId: string;
  embedding: number[];
  domainDescription: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantPayload {
  tenantId: string;
  domainDescription: string;
  createdAt: string;
  updatedAt: string;
}

interface QdrantSearchResult {
  id: number;
  score: number;
  vector: number[];
  payload: TenantPayload;
}

@Injectable()
export class TenantEmbeddingService {
  private readonly COLLECTION = 'tenants';
  private initialized = false;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  isInitialized(): boolean {
    return this.initialized;
  }

  async ensureCollection(): Promise<boolean> {
    if (!this.vectorStore.isAvailable()) {
      console.warn('[TenantEmbeddingService] Vector store not available');
      return false;
    }

    try {
      const client = this.getQdrantClient();
      if (!client) {
        console.warn('[TenantEmbeddingService] Qdrant client not available');
        return false;
      }

      const collections = await client.getCollections();
      const exists = collections.collections.some((c: { name: string }) => c.name === this.COLLECTION);

      if (!exists) {
        await client.createCollection(this.COLLECTION, {
          vectors: {
            size: this.embeddingService.getEmbeddingDimensions(),
            distance: 'Cosine',
          },
        });
        console.log(`[TenantEmbeddingService] Created collection: ${this.COLLECTION}`);
      } else {
        console.log(`[TenantEmbeddingService] Collection exists: ${this.COLLECTION}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[TenantEmbeddingService] Failed to ensure collection:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  private getQdrantClient(): QdrantHttpClient | null {
    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    if (!qdrantUrl) {
      return null;
    }

    return new QdrantHttpClient(qdrantUrl, qdrantApiKey);
  }

  async initialize(tenantId: string, domainDescription: string): Promise<TenantEmbeddingContext | null> {
    if (!this.embeddingService.isAvailable()) {
      console.warn('[TenantEmbeddingService] Embedding service not available');
      return null;
    }

    const embedding = await this.embeddingService.generateEmbedding(domainDescription);
    if (!embedding) {
      console.warn('[TenantEmbeddingService] Failed to generate embedding for tenant:', tenantId);
      return null;
    }

    const context: TenantEmbeddingContext = {
      tenantId,
      embedding,
      domainDescription,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const client = this.getQdrantClient();
    if (!client) {
      console.warn('[TenantEmbeddingService] Qdrant client not available');
      return null;
    }

    try {
      await client.upsert(this.COLLECTION, [{
        id: this.hashTenantId(tenantId),
        vector: embedding,
        payload: {
          tenantId,
          domainDescription,
          createdAt: context.createdAt.toISOString(),
          updatedAt: context.updatedAt.toISOString(),
        },
      }]);

      console.log(`[TenantEmbeddingService] Initialized tenant: ${tenantId}`);
      return context;
    } catch (error) {
      console.error('[TenantEmbeddingService] Failed to store tenant:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async getContext(tenantId: string): Promise<TenantEmbeddingContext | null> {
    const client = this.getQdrantClient();
    if (!client) {
      return null;
    }

    try {
      const result = await client.retrieve(this.COLLECTION, this.hashTenantId(tenantId));
      if (!result) {
        return null;
      }

      const payload = result.payload as TenantPayload;
      return {
        tenantId: payload.tenantId,
        embedding: result.vector,
        domainDescription: payload.domainDescription,
        createdAt: new Date(payload.createdAt),
        updatedAt: new Date(payload.updatedAt),
      };
    } catch (error) {
      console.error('[TenantEmbeddingService] Failed to get tenant context:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async findSimilar(embedding: number[], limit: number = 3): Promise<TenantEmbeddingContext[]> {
    const client = this.getQdrantClient();
    if (!client) {
      return [];
    }

    try {
      const results = await client.search(this.COLLECTION, embedding, limit) as QdrantSearchResult[];

      return results.map(r => ({
        tenantId: r.payload.tenantId,
        embedding: r.vector || [],
        domainDescription: r.payload.domainDescription,
        createdAt: new Date(r.payload.createdAt),
        updatedAt: new Date(r.payload.updatedAt),
      }));
    } catch (error) {
      console.error('[TenantEmbeddingService] Failed to find similar tenants:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async updateFromUsage(tenantId: string, _interaction: unknown): Promise<void> {
    console.log(`[TenantEmbeddingService] Recording usage for ${tenantId}`);
  }

  private hashTenantId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

class QdrantHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Qdrant API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return data.result as T;
  }

  async getCollections(): Promise<{ collections: { name: string }[] }> {
    return this.request('GET', '/collections');
  }

  async createCollection(name: string, config: { vectors: { size: number; distance: string } }): Promise<void> {
    await this.request('PUT', `/collections/${name}`, config);
  }

  async upsert(collection: string, points: { id: number; vector: number[]; payload: unknown }[]): Promise<void> {
    await this.request('PUT', `/collections/${collection}/points`, { points });
  }

  async retrieve(collection: string, id: number): Promise<{ vector: number[]; payload: unknown } | null> {
    try {
      const result = await this.request<{ id: number; vector: number[]; payload: unknown }[]>(
        'POST',
        `/collections/${collection}/points`,
        { ids: [id], with_vector: true, with_payload: true },
      );
      return result.length > 0 ? result[0] : null;
    } catch {
      return null;
    }
  }

  async search(
    collection: string,
    vector: number[],
    limit: number,
  ): Promise<{ id: number; score: number; vector: number[]; payload: unknown }[]> {
    return this.request('POST', `/collections/${collection}/points/search`, {
      vector,
      limit,
      with_payload: true,
      with_vector: true,
    });
  }
}
