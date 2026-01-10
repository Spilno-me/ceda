import { Injectable } from '@nestjs/common';
import { Pattern, PatternMatch } from '../interfaces';
import { EmbeddingService } from './embedding.service';

interface PatternVector {
  id: number;
  vector: number[];
  payload: {
    patternId: string;
    name: string;
    category: string;
    description: string;
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

  async search(collection: string, vector: number[], limit: number): Promise<{ id: number; score: number; payload: unknown }[]> {
    return this.request('POST', `/collections/${collection}/points/search`, {
      vector,
      limit,
      with_payload: true,
    });
  }
}

@Injectable()
export class VectorStoreService {
  private client: QdrantHttpClient | null = null;
  private readonly collectionName = 'ceda_patterns';
  private patterns: Map<string, Pattern> = new Map();
  private initialized = false;

  constructor(private readonly embeddingService: EmbeddingService) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    console.log(`[VectorStoreService] Connecting to: ${qdrantUrl}`);
    console.log(`[VectorStoreService] API key present: ${!!qdrantApiKey} (${qdrantApiKey?.slice(0, 20)}...)`);

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
    } catch (error) {
      console.warn('[VectorStoreService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
    }
  }

  isAvailable(): boolean {
    return this.client !== null && this.embeddingService.isAvailable();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<boolean> {
    if (!this.client) {
      console.warn('[VectorStoreService] Qdrant client not initialized');
      return false;
    }

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
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
    if (!this.client || !this.embeddingService.isAvailable()) {
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
            },
          });
        }
      }

      if (points.length > 0) {
        await this.client.upsert(this.collectionName, points);
        console.log(`[VectorStoreService] Seeded ${points.length} patterns to Qdrant`);
      }

      return true;
    } catch (error) {
      console.error('[VectorStoreService] Failed to seed patterns:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  async searchSimilarPatterns(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.client || !this.embeddingService.isAvailable() || !this.initialized) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      if (!queryEmbedding) {
        return [];
      }

      const searchResult = await this.client.search(this.collectionName, queryEmbedding, limit);

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

  async findBestMatch(query: string, minScore: number = 0.3): Promise<PatternMatch | null> {
    const results = await this.searchSimilarPatterns(query, 1);
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
}
