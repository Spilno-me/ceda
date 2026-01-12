/**
 * CEDA-35: Observation Service
 *
 * Captures pattern observations from Herald sessions for the learning loop.
 * Stores observations in Qdrant for semantic search and analysis.
 */

import { Injectable } from '@nestjs/common';
import {
  Observation,
  Modification,
  ModificationType,
  ObservationOutcome,
  ObservationSource,
  PatternObservationStats,
  StructurePrediction,
  SectionPrediction,
  FieldPrediction,
  CreateObservationDto,
} from '../interfaces';
import { EmbeddingService } from './embedding.service';
import { SessionState } from './session.service';

interface ObservationVector {
  id: number;
  vector: number[];
  payload: {
    observationId: string;
    sessionId: string;
    company: string;
    project: string;
    user: string;
    patternId: string;
    patternName: string;
    outcome: ObservationOutcome;
    input: string;
    feedback: string | null;
    confidence: number;
    processingTime: number;
    timestamp: string;
    modificationsCount: number;
    source: ObservationSource;
    /** CEDA-40: Store full prediction for retrieval */
    prediction: string;
    /** CEDA-40: Store modifications for retrieval */
    modifications: string;
  };
}

interface QdrantFilter {
  should?: QdrantCondition[];
  must?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

interface QdrantCondition {
  key: string;
  match?: { value: string | number | null };
  range?: { gte?: number; lte?: number };
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

    console.log(`[ObservationService] ${method} ${url}`);

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

  async scroll(
    collection: string,
    filter?: QdrantFilter,
    limit: number = 100,
  ): Promise<{ points: { id: number; payload: unknown }[] }> {
    const body: Record<string, unknown> = {
      limit,
      with_payload: true,
    };
    if (filter) {
      body.filter = filter;
    }
    return this.request('POST', `/collections/${collection}/points/scroll`, body);
  }
}

@Injectable()
export class ObservationService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'observations';
  private observations: Map<string, Observation> = new Map();
  private initialized = false;

  constructor(private readonly embeddingService: EmbeddingService) {}

  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[ObservationService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);

    if (!qdrantUrl) {
      console.warn('[ObservationService] QDRANT_URL not set - observation storage disabled');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[ObservationService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[ObservationService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
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
      console.warn('[ObservationService] Qdrant client not available');
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
        console.log(`[ObservationService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[ObservationService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[ObservationService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Capture an observation from a Herald session
   */
  async capture(
    session: SessionState,
    outcome: ObservationOutcome,
    finalStructure?: StructurePrediction,
    feedback?: string,
    patternId?: string,
    patternName?: string,
    company?: string,
    project?: string,
    user?: string,
    processingTime?: number,
  ): Promise<Observation> {
    const observationId = this.generateId();
    const prediction = session.currentPrediction;

    if (!prediction) {
      throw new Error('No prediction in session to observe');
    }

    const modifications = finalStructure
      ? this.diffPredictions(prediction, finalStructure)
      : [];

    const observation: Observation = {
      id: observationId,
      sessionId: session.id,
      company: company || 'unknown',
      project: project || 'unknown',
      user: user || 'unknown',
      patternId: patternId || prediction.moduleType || 'unknown',
      patternName: patternName || prediction.moduleType || 'Unknown Pattern',
      prediction,
      outcome,
      modifications,
      feedback,
      input: session.originalSignal,
      confidence: prediction.confidence,
      processingTime: processingTime || 0,
      timestamp: new Date(),
      source: 'live',
    };

    this.observations.set(observationId, observation);

    await this.storeInQdrant(observation);

    console.log(`[ObservationService] Captured observation: ${observationId} (${outcome}, ${modifications.length} modifications)`);

    return observation;
  }

  /**
   * CEDA-39: Create a direct observation without requiring an existing session
   * Generates a synthetic sessionId and marks source as 'direct'
   */
  async createDirect(dto: CreateObservationDto): Promise<Observation> {
    const observationId = this.generateId();
    const syntheticSessionId = this.generateSyntheticSessionId();

    const modifications = dto.finalStructure
      ? this.diffPredictions(dto.prediction, dto.finalStructure)
      : [];

    const observation: Observation = {
      id: observationId,
      sessionId: syntheticSessionId,
      company: dto.company,
      project: dto.project || 'unknown',
      user: dto.user || 'unknown',
      patternId: dto.patternId || dto.prediction.moduleType || 'unknown',
      patternName: dto.patternName || dto.prediction.moduleType || 'Unknown Pattern',
      prediction: dto.prediction,
      outcome: dto.outcome,
      modifications,
      feedback: dto.feedback,
      input: dto.input,
      confidence: dto.confidence ?? dto.prediction.confidence,
      processingTime: dto.processingTime || 0,
      timestamp: new Date(),
      source: 'direct',
    };

    this.observations.set(observationId, observation);

    await this.storeInQdrant(observation);

    console.log(`[ObservationService] Created direct observation: ${observationId} (${dto.outcome}, ${modifications.length} modifications, session: ${syntheticSessionId})`);

    return observation;
  }

  /**
   * Generate a synthetic session ID for direct observations
   */
  private generateSyntheticSessionId(): string {
    return `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store observation in Qdrant for semantic search
   */
  private async storeInQdrant(observation: Observation): Promise<boolean> {
    const client = this.getClient();
    if (!client || !this.embeddingService.isAvailable()) {
      console.warn('[ObservationService] Cannot store observation - services not available');
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      const textToEmbed = this.createEmbeddingText(observation);
      const embedding = await this.embeddingService.generateEmbedding(textToEmbed);

      if (!embedding) {
        console.warn('[ObservationService] Failed to generate embedding for observation');
        return false;
      }

      const point: ObservationVector = {
        id: this.hashObservationId(observation.id),
        vector: embedding,
        payload: {
          observationId: observation.id,
          sessionId: observation.sessionId,
          company: observation.company,
          project: observation.project,
          user: observation.user,
          patternId: observation.patternId,
          patternName: observation.patternName,
          outcome: observation.outcome,
          input: observation.input,
          feedback: observation.feedback || null,
          confidence: observation.confidence,
          processingTime: observation.processingTime,
          timestamp: observation.timestamp.toISOString(),
          modificationsCount: observation.modifications.length,
          source: observation.source,
          // CEDA-40: Store full prediction and modifications for retrieval
          prediction: JSON.stringify(observation.prediction),
          modifications: JSON.stringify(observation.modifications),
        },
      };

      await client.upsert(this.collectionName, [point]);
      console.log(`[ObservationService] Stored observation ${observation.id} in Qdrant`);
      return true;
    } catch (error) {
      console.error('[ObservationService] Failed to store observation:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Find similar observations using semantic search
   */
  async findSimilar(input: string, company: string, limit: number = 10): Promise<Observation[]> {
    const client = this.getClient();
    if (!client || !this.embeddingService.isAvailable() || !this.initialized) {
      return this.findSimilarInMemory(input, company, limit);
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(input);
      if (!queryEmbedding) {
        return this.findSimilarInMemory(input, company, limit);
      }

      const filter: QdrantFilter = {
        must: [
          { key: 'company', match: { value: company } },
        ],
      };

      const searchResult = await client.search(this.collectionName, queryEmbedding, limit, filter);

      const results: Observation[] = [];
      for (const hit of searchResult) {
        const payload = hit.payload as ObservationVector['payload'];
        const observation = this.observations.get(payload.observationId);
        if (observation) {
          results.push(observation);
        }
      }

      return results;
    } catch (error) {
      console.error('[ObservationService] Search failed:', error instanceof Error ? error.message : error);
      return this.findSimilarInMemory(input, company, limit);
    }
  }

  /**
   * Fallback in-memory search when Qdrant is unavailable
   */
  private findSimilarInMemory(input: string, company: string, limit: number): Observation[] {
    const inputLower = input.toLowerCase();
    const results: { observation: Observation; score: number }[] = [];

    for (const observation of this.observations.values()) {
      if (observation.company !== company) continue;

      const observationInput = observation.input.toLowerCase();
      let score = 0;

      const inputWords = inputLower.split(/\s+/);
      for (const word of inputWords) {
        if (observationInput.includes(word)) {
          score += 1;
        }
      }

      if (score > 0) {
        results.push({ observation, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.observation);
  }

  /**
   * Get statistics for a pattern's observations
   */
  async getPatternStats(patternId: string, company?: string): Promise<PatternObservationStats> {
    const observations = this.getObservationsByPattern(patternId, company);

    const stats: PatternObservationStats = {
      patternId,
      totalObservations: observations.length,
      outcomes: {
        accepted: 0,
        modified: 0,
        rejected: 0,
      },
      acceptanceRate: 0,
      modificationRate: 0,
      rejectionRate: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      commonModifications: [],
    };

    if (observations.length === 0) {
      return stats;
    }

    let totalConfidence = 0;
    let totalProcessingTime = 0;
    const modificationCounts: Map<string, { type: ModificationType; path: string; count: number }> = new Map();

    for (const obs of observations) {
      stats.outcomes[obs.outcome]++;
      totalConfidence += obs.confidence;
      totalProcessingTime += obs.processingTime;

      for (const mod of obs.modifications) {
        const key = `${mod.type}:${mod.path}`;
        const existing = modificationCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          modificationCounts.set(key, { type: mod.type, path: mod.path, count: 1 });
        }
      }
    }

    stats.acceptanceRate = stats.outcomes.accepted / observations.length;
    stats.modificationRate = stats.outcomes.modified / observations.length;
    stats.rejectionRate = stats.outcomes.rejected / observations.length;
    stats.averageConfidence = totalConfidence / observations.length;
    stats.averageProcessingTime = totalProcessingTime / observations.length;

    stats.commonModifications = Array.from(modificationCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Get observations for a specific pattern
   */
  getObservationsByPattern(patternId: string, company?: string): Observation[] {
    const results: Observation[] = [];
    for (const observation of this.observations.values()) {
      if (observation.patternId === patternId) {
        if (!company || observation.company === company) {
          results.push(observation);
        }
      }
    }
    return results;
  }

  /**
   * Get observation by ID
   * CEDA-40: First checks in-memory Map, then falls back to Qdrant retrieval
   */
  async getObservation(observationId: string): Promise<Observation | null> {
    // First check in-memory Map
    const cached = this.observations.get(observationId);
    if (cached) {
      return cached;
    }

    // CEDA-40: Fall back to Qdrant retrieval if not in memory
    const fromQdrant = await this.retrieveFromQdrant(observationId);
    if (fromQdrant) {
      // Cache in memory for future requests
      this.observations.set(observationId, fromQdrant);
      console.log(`[ObservationService] Retrieved observation ${observationId} from Qdrant and cached`);
    }
    return fromQdrant;
  }

  /**
   * CEDA-40: Retrieve observation from Qdrant by observationId
   * Reconstructs full Observation object from stored payload
   */
  private async retrieveFromQdrant(observationId: string): Promise<Observation | null> {
    const client = this.getClient();
    if (!client || !this.initialized) {
      return null;
    }

    try {
      const filter: QdrantFilter = {
        must: [
          { key: 'observationId', match: { value: observationId } },
        ],
      };

      const result = await client.scroll(this.collectionName, filter, 1);

      if (!result.points || result.points.length === 0) {
        return null;
      }

      const payload = result.points[0].payload as ObservationVector['payload'];

      // Reconstruct full Observation object from payload
      const observation: Observation = {
        id: payload.observationId,
        sessionId: payload.sessionId,
        company: payload.company,
        project: payload.project,
        user: payload.user,
        patternId: payload.patternId,
        patternName: payload.patternName,
        prediction: JSON.parse(payload.prediction),
        outcome: payload.outcome,
        modifications: JSON.parse(payload.modifications),
        feedback: payload.feedback || undefined,
        input: payload.input,
        confidence: payload.confidence,
        processingTime: payload.processingTime,
        timestamp: new Date(payload.timestamp),
        source: payload.source,
      };

      return observation;
    } catch (error) {
      console.error('[ObservationService] Failed to retrieve from Qdrant:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Diff two predictions to find modifications
   */
  diffPredictions(original: StructurePrediction, final: StructurePrediction): Modification[] {
    const modifications: Modification[] = [];

    if (original.moduleType !== final.moduleType) {
      modifications.push({
        type: 'change',
        path: 'moduleType',
        before: original.moduleType,
        after: final.moduleType,
      });
    }

    this.diffSections(original.sections, final.sections, modifications);

    return modifications;
  }

  /**
   * Diff sections between two predictions
   */
  private diffSections(
    originalSections: SectionPrediction[],
    finalSections: SectionPrediction[],
    modifications: Modification[],
  ): void {
    const originalMap = new Map(originalSections.map((s, i) => [s.name, { section: s, index: i }]));
    const finalMap = new Map(finalSections.map((s, i) => [s.name, { section: s, index: i }]));

    for (const [name, { section, index }] of originalMap) {
      if (!finalMap.has(name)) {
        modifications.push({
          type: 'remove',
          path: `sections[${index}]`,
          before: section,
        });
      }
    }

    for (const [name, { section, index }] of finalMap) {
      const original = originalMap.get(name);
      if (!original) {
        modifications.push({
          type: 'add',
          path: `sections[${index}]`,
          after: section,
        });
      } else {
        this.diffFields(original.section.fields, section.fields, `sections[${index}]`, modifications);

        if (original.section.order !== section.order) {
          modifications.push({
            type: 'change',
            path: `sections[${index}].order`,
            before: original.section.order,
            after: section.order,
          });
        }
      }
    }
  }

  /**
   * Diff fields between two sections
   */
  private diffFields(
    originalFields: FieldPrediction[],
    finalFields: FieldPrediction[],
    sectionPath: string,
    modifications: Modification[],
  ): void {
    const originalMap = new Map(originalFields.map((f, i) => [f.name, { field: f, index: i }]));
    const finalMap = new Map(finalFields.map((f, i) => [f.name, { field: f, index: i }]));

    for (const [name, { field, index }] of originalMap) {
      if (!finalMap.has(name)) {
        modifications.push({
          type: 'remove',
          path: `${sectionPath}.fields[${index}]`,
          before: field,
        });
      }
    }

    for (const [name, { field, index }] of finalMap) {
      const original = originalMap.get(name);
      if (!original) {
        modifications.push({
          type: 'add',
          path: `${sectionPath}.fields[${index}]`,
          after: field,
        });
      } else {
        if (original.field.type !== field.type) {
          modifications.push({
            type: 'change',
            path: `${sectionPath}.fields[${index}].type`,
            before: original.field.type,
            after: field.type,
          });
        }
        if (original.field.required !== field.required) {
          modifications.push({
            type: 'change',
            path: `${sectionPath}.fields[${index}].required`,
            before: original.field.required,
            after: field.required,
          });
        }
      }
    }
  }

  /**
   * Create text for embedding from observation
   */
  private createEmbeddingText(observation: Observation): string {
    const parts = [observation.input];
    if (observation.feedback) {
      parts.push(observation.feedback);
    }
    parts.push(`Pattern: ${observation.patternName}`);
    parts.push(`Outcome: ${observation.outcome}`);
    return parts.join('. ');
  }

  /**
   * Generate unique observation ID
   */
  private generateId(): string {
    return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash observation ID for Qdrant vector ID
   */
  private hashObservationId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get total observation count
   */
  getObservationCount(): number {
    return this.observations.size;
  }

  /**
   * Clear observations (for testing)
   */
  clearObservations(): void {
    this.observations.clear();
  }
}
