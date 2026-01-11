import { Injectable } from '@nestjs/common';
import { Pattern, PatternMatch, TenantContext } from '../interfaces';
import { EmbeddingService } from './embedding.service';

interface PatternVector {
  id: number;
  vector: number[];
  payload: {
    patternId: string;
    name: string;
    category: string;
    description: string;
    /** Company identifier for multi-tenant filtering. Null/undefined = global pattern */
    company: string | null;
  };
}

interface SearchResult {
  pattern: Pattern;
  score: number;
}

/**
 * Lightweight Qdrant client using native fetch
 * Bypasses @qdrant/js-client-rest Undici issues on Railway
 */
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

    console.log(`[QdrantHttpClient] ${method} ${url}`);

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

  async search(
    collection: string,
    vector: number[],
    limit: number,
    filter?: QdrantFilter,
  ): Promise<{ id: number; score: number; payload: unknown }[]> {
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    };
    if (filter) {
      body.filter = filter;
    }
    return this.request('POST', `/collections/${collection}/points/search`, body);
  }
}

/** Qdrant filter structure for tenant filtering */
interface QdrantFilter {
  should?: QdrantCondition[];
  must?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

interface QdrantCondition {
  key: string;
  match?: { value: string | null };
  is_null?: { key: string };
}

@Injectable()
export class VectorStoreService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'ceda_patterns';
  private patterns: Map<string, Pattern> = new Map();
  private initialized = false;

  constructor(private readonly embeddingService: EmbeddingService) {
    // Don't initialize client in constructor - env vars may not be available yet
    // Use lazy initialization in getClient() instead
  }

  /**
   * Lazy initialization - reads env vars at runtime, not at module load time
   * This fixes Railway env var injection timing issues
   */
  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    // Try both naming conventions (QDRANT_ may be filtered by Railway)
    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[VectorStoreService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);
    console.log(`[VectorStoreService] Lazy init - API key present: ${!!qdrantApiKey}`);

    if (!qdrantUrl) {
      console.warn('[VectorStoreService] QDRANT_URL not set - vector search disabled');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[VectorStoreService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[VectorStoreService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
      this.clientInitialized = true;
    }

    return this.client;
  }

  isAvailable(): boolean {
    return this.getClient() !== null && this.embeddingService.isAvailable();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      console.warn('[VectorStoreService] Qdrant client not available');
      return false;
    }

    try {
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        await client.createCollection(this.collectionName, {
          vectors: {
            size: this.embeddingService.getEmbeddingDimensions(),
            distance: 'Cosine',
          },
        });
        console.log(`[VectorStoreService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[VectorStoreService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[VectorStoreService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  async seedPatterns(patterns: Pattern[]): Promise<boolean> {
    const client = this.getClient();
    if (!client || !this.embeddingService.isAvailable()) {
      console.warn('[VectorStoreService] Cannot seed patterns - services not available');
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      const patternTexts = patterns.map(p => this.createPatternText(p));
      const embeddings = await this.embeddingService.generateEmbeddings(patternTexts);

      const points: PatternVector[] = [];
      for (let i = 0; i < patterns.length; i++) {
        const embedding = embeddings[i];
        if (embedding) {
          const pattern = patterns[i];
          this.patterns.set(pattern.id, pattern);
          points.push({
            id: this.hashPatternId(pattern.id),
            vector: embedding,
            payload: {
              patternId: pattern.id,
              name: pattern.name,
              category: pattern.category,
              description: pattern.description,
              company: pattern.company ?? null,
            },
          });
        }
      }

      if (points.length > 0) {
        await client.upsert(this.collectionName, points);
        console.log(`[VectorStoreService] Seeded ${points.length} patterns to Qdrant`);
      }

      return true;
    } catch (error) {
      console.error('[VectorStoreService] Failed to seed patterns:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Search for similar patterns using vector similarity
   * @param query - The search query text
   * @param limit - Maximum number of results to return
   * @param tenantContext - Optional tenant context for multi-tenant filtering
   */
  async searchSimilarPatterns(
    query: string,
    limit: number = 5,
    tenantContext?: TenantContext,
  ): Promise<SearchResult[]> {
    const client = this.getClient();
    if (!client || !this.embeddingService.isAvailable() || !this.initialized) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      if (!queryEmbedding) {
        return [];
      }

      const filter = this.buildTenantFilter(tenantContext);
      const searchResult = await client.search(this.collectionName, queryEmbedding, limit, filter);

      const results: SearchResult[] = [];
      for (const hit of searchResult) {
        const payload = hit.payload as PatternVector['payload'];
        const pattern = this.patterns.get(payload.patternId);
        if (pattern) {
          results.push({
            pattern,
            score: hit.score,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[VectorStoreService] Search failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Search patterns using a pre-computed embedding vector
   * Used by AI-native multi-tenancy for context-aware retrieval with fused embeddings
   * @param vector - Pre-computed embedding vector (e.g., fused query + tenant)
   * @param limit - Maximum number of results to return
   */
  async searchByVector(
    vector: number[],
    limit: number = 5,
  ): Promise<SearchResult[]> {
    const client = this.getClient();
    if (!client || !this.initialized) {
      return [];
    }

    try {
      // NO filter - AI-native uses soft ranking via embedding similarity
      const searchResult = await client.search(this.collectionName, vector, limit);

      const results: SearchResult[] = [];
      for (const hit of searchResult) {
        const payload = hit.payload as PatternVector['payload'];
        const pattern = this.patterns.get(payload.patternId);
        if (pattern) {
          results.push({
            pattern,
            score: hit.score,
          });
        }
      }

      console.log(`[VectorStoreService] searchByVector returned ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[VectorStoreService] searchByVector failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Build Qdrant filter for tenant-based pattern filtering
   * - If tenantContext.company is provided: match patterns where company equals the tenant's company OR company is null (global patterns)
   * - If no company provided: no filter (return all patterns)
   */
  private buildTenantFilter(tenantContext?: TenantContext): QdrantFilter | undefined {
    if (!tenantContext?.company) {
      return undefined;
    }

    return {
      should: [
        { key: 'company', match: { value: tenantContext.company } },
        { key: 'company', match: { value: null } },
      ],
    };
  }

  /**
   * Find the best matching pattern for a query using vector similarity
   * @param query - The search query text
   * @param minScore - Minimum similarity score threshold (default: 0.3)
   * @param tenantContext - Optional tenant context for multi-tenant filtering
   */
  async findBestMatch(
    query: string,
    minScore: number = 0.3,
    tenantContext?: TenantContext,
  ): Promise<PatternMatch | null> {
    const results = await this.searchSimilarPatterns(query, 1, tenantContext);
    if (results.length === 0 || results[0].score < minScore) {
      return null;
    }

    const best = results[0];
    return {
      pattern: best.pattern,
      score: best.score,
      matchedRules: ['vector_similarity'],
    };
  }

  private createPatternText(pattern: Pattern): string {
    const sections = pattern.structure.sections.map(s => s.name).join(', ');
    const workflows = pattern.structure.workflows.join(', ');
    return `${pattern.name}: ${pattern.description}. Sections: ${sections}. Workflows: ${workflows}. Category: ${pattern.category}`;
  }

  private hashPatternId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  getPatternCount(): number {
    return this.patterns.size;
  }

  /**
   * Ensure the tenants collection exists in Qdrant
   * Used for AI-native multi-tenancy with embedding-based retrieval
   */
  async ensureTenantsCollection(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      console.warn('[VectorStoreService] Qdrant client not available for tenants collection');
      return false;
    }

    try {
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === 'tenants');

      if (!exists) {
        await client.createCollection('tenants', {
          vectors: {
            size: this.embeddingService.getEmbeddingDimensions(),
            distance: 'Cosine',
          },
        });
        console.log('[VectorStoreService] Created tenants collection');
      } else {
        console.log('[VectorStoreService] Tenants collection already exists');
      }

      return true;
    } catch (error) {
      console.error('[VectorStoreService] Failed to ensure tenants collection:', error instanceof Error ? error.message : error);
      return false;
    }
  }
}
