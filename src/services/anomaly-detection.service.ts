/**
 * CEDA-52: Anomaly Detection Service
 *
 * Detects suspicious patterns in CEDA usage:
 * - Burst creation: >20 patterns/hour from a company
 * - Low quality flood: >50% low quality patterns from a company
 * - Duplicate spam: Repeated identical pattern submissions
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DetectedAnomaly,
  AnomalyType,
  AnomalySeverity,
  AnomalyStatus,
  AnomalyEvidence,
  AnomalyFilter,
  DetectionResult,
  Pattern,
} from '../interfaces';
import { PatternLibraryService } from './pattern-library.service';
import { QualityScoreService } from './quality-score.service';

interface AnomalyPayload {
  anomalyId: string;
  type: string;
  severity: string;
  entityType: string;
  entityId: string;
  company: string;
  description: string;
  evidence: string;
  detectedAt: string;
  status: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
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

    console.log(`[AnomalyDetectionService] ${method} ${url}`);

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

  async scroll(
    collection: string,
    filter?: { must?: { key: string; match: { value: string } }[] },
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
export class AnomalyDetectionService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'ceda_anomalies';
  private readonly vectorSize = 4;
  private anomalies: Map<string, DetectedAnomaly> = new Map();
  private initialized = false;

  private static readonly BURST_THRESHOLD = 20;
  private static readonly BURST_WINDOW_MS = 60 * 60 * 1000;
  private static readonly LOW_QUALITY_THRESHOLD = 0.5;

  constructor(
    private readonly patternLibrary: PatternLibraryService,
    private readonly qualityScoreService: QualityScoreService,
  ) {}

  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[AnomalyDetectionService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);

    if (!qdrantUrl) {
      console.warn('[AnomalyDetectionService] QDRANT_URL not set - anomaly storage in memory only');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[AnomalyDetectionService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[AnomalyDetectionService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
      this.clientInitialized = true;
    }

    return this.client;
  }

  isAvailable(): boolean {
    return this.getClient() !== null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      console.warn('[AnomalyDetectionService] Qdrant client not available - using in-memory storage');
      this.initialized = true;
      return true;
    }

    try {
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        await client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });
        console.log(`[AnomalyDetectionService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[AnomalyDetectionService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[AnomalyDetectionService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      this.initialized = true;
      return true;
    }
  }

    /**
     * Detect burst creation: >20 patterns created in the last hour by a company
     */
    detectBurstCreation(company: string): DetectedAnomaly | null {
    const now = new Date();
    const windowStart = new Date(now.getTime() - AnomalyDetectionService.BURST_WINDOW_MS);

    const companyPatterns = this.patternLibrary
      .getAllPatterns()
      .filter(p => p.company === company);

    const recentPatterns = companyPatterns.filter(p => {
      const createdAt = p.metadata?.createdAt;
      if (!createdAt) return false;
      const createdDate = new Date(createdAt);
      return createdDate >= windowStart && createdDate <= now;
    });

    if (recentPatterns.length > AnomalyDetectionService.BURST_THRESHOLD) {
      const severity = this.calculateBurstSeverity(recentPatterns.length);
      const evidence: AnomalyEvidence[] = recentPatterns.map(p => ({
        type: 'pattern_created',
        value: { patternId: p.id, name: p.name },
        timestamp: p.metadata?.createdAt ? new Date(p.metadata.createdAt) : undefined,
      }));

      const anomaly = this.createAnomaly(
        AnomalyType.BURST_CREATION,
        severity,
        'pattern',
        company,
        company,
        `Detected ${recentPatterns.length} patterns created in the last hour (threshold: ${AnomalyDetectionService.BURST_THRESHOLD})`,
        evidence,
      );

      return anomaly;
    }

    return null;
  }

    /**
     * Detect low quality flood: >50% of patterns from a company are low quality
     */
    detectLowQualityFlood(company: string): DetectedAnomaly | null {
    const companyPatterns = this.patternLibrary
      .getAllPatterns()
      .filter(p => p.company === company);

    if (companyPatterns.length === 0) {
      return null;
    }

    const lowQualityPatterns = this.qualityScoreService.flagLowQuality(companyPatterns);
    const lowQualityRatio = lowQualityPatterns.length / companyPatterns.length;

    if (lowQualityRatio > AnomalyDetectionService.LOW_QUALITY_THRESHOLD) {
      const severity = this.calculateQualitySeverity(lowQualityRatio);
      const evidence: AnomalyEvidence[] = lowQualityPatterns.map(p => ({
        type: 'low_quality_pattern',
        value: {
          patternId: p.id,
          name: p.name,
          qualityScore: p.qualityScore ?? this.qualityScoreService.calculateScore(p),
        },
      }));

      const anomaly = this.createAnomaly(
        AnomalyType.LOW_QUALITY_FLOOD,
        severity,
        'pattern',
        company,
        company,
        `${Math.round(lowQualityRatio * 100)}% of patterns (${lowQualityPatterns.length}/${companyPatterns.length}) are low quality (threshold: ${AnomalyDetectionService.LOW_QUALITY_THRESHOLD * 100}%)`,
        evidence,
      );

      return anomaly;
    }

    return null;
  }

    /**
     * Detect duplicate spam: Multiple identical pattern submissions
     */
    detectDuplicateSpam(company: string): DetectedAnomaly | null {
    const companyPatterns = this.patternLibrary
      .getAllPatterns()
      .filter(p => p.company === company);

    const nameCount = new Map<string, Pattern[]>();
    for (const pattern of companyPatterns) {
      const normalizedName = pattern.name.toLowerCase().trim();
      const existing = nameCount.get(normalizedName) || [];
      existing.push(pattern);
      nameCount.set(normalizedName, existing);
    }

    const duplicates: Pattern[][] = [];
    for (const patterns of nameCount.values()) {
      if (patterns.length > 1) {
        duplicates.push(patterns);
      }
    }

    if (duplicates.length > 0) {
      const totalDuplicates = duplicates.reduce((sum, group) => sum + group.length - 1, 0);
      const severity = this.calculateDuplicateSeverity(totalDuplicates);
      const evidence: AnomalyEvidence[] = duplicates.flatMap(group =>
        group.map(p => ({
          type: 'duplicate_pattern',
          value: { patternId: p.id, name: p.name },
          timestamp: p.metadata?.createdAt ? new Date(p.metadata.createdAt) : undefined,
        })),
      );

      const anomaly = this.createAnomaly(
        AnomalyType.DUPLICATE_SPAM,
        severity,
        'pattern',
        company,
        company,
        `Detected ${totalDuplicates} duplicate pattern submissions across ${duplicates.length} pattern names`,
        evidence,
      );

      return anomaly;
    }

    return null;
  }

    /**
     * Run all detection methods for a company or all companies
     */
    async runDetectionSweep(company?: string): Promise<DetectionResult[]> {
      const results: DetectionResult[] = [];
      const companies = company
        ? [company]
        : this.getUniqueCompanies();

      for (const comp of companies) {
        const anomalies: DetectedAnomaly[] = [];
      let scannedEntities = 0;

      const burstAnomaly = this.detectBurstCreation(comp);
      if (burstAnomaly) {
        anomalies.push(burstAnomaly);
      }

      const qualityAnomaly = this.detectLowQualityFlood(comp);
      if (qualityAnomaly) {
        anomalies.push(qualityAnomaly);
      }

      const duplicateAnomaly = this.detectDuplicateSpam(comp);
      if (duplicateAnomaly) {
        anomalies.push(duplicateAnomaly);
      }

      scannedEntities = this.patternLibrary
        .getAllPatterns()
        .filter(p => p.company === comp).length;

      results.push({
        anomaliesDetected: anomalies,
        scannedEntities,
        company: comp,
        timestamp: new Date(),
      });
    }

    return results;
  }

    /**
     * Acknowledge an anomaly
     */
    async acknowledge(anomalyId: string, acknowledgedBy?: string): Promise<DetectedAnomaly | null> {
    const anomaly = this.anomalies.get(anomalyId);
    if (!anomaly) {
      return null;
    }

    anomaly.status = 'acknowledged';
    anomaly.acknowledgedAt = new Date();
    anomaly.acknowledgedBy = acknowledgedBy;

    await this.storeInQdrant(anomaly);

    console.log(`[AnomalyDetectionService] Acknowledged anomaly: ${anomalyId}`);

    return anomaly;
  }

    /**
     * Resolve an anomaly
     */
    async resolve(anomalyId: string, resolvedBy?: string): Promise<DetectedAnomaly | null> {
    const anomaly = this.anomalies.get(anomalyId);
    if (!anomaly) {
      return null;
    }

    anomaly.status = 'resolved';
    anomaly.resolvedAt = new Date();
    anomaly.resolvedBy = resolvedBy;

    await this.storeInQdrant(anomaly);

    console.log(`[AnomalyDetectionService] Resolved anomaly: ${anomalyId}`);

    return anomaly;
  }

    /**
     * Get anomalies with optional filtering
     */
    async getAnomalies(filter?: AnomalyFilter): Promise<DetectedAnomaly[]> {
    const client = this.getClient();

    if (client && this.initialized) {
      try {
        const qdrantFilter = filter?.company
          ? { must: [{ key: 'company', match: { value: filter.company } }] }
          : undefined;

                const result = await client.scroll(this.collectionName, qdrantFilter, 1000);

                const anomalies: DetectedAnomaly[] = [];
        for (const point of result.points) {
          const payload = point.payload as AnomalyPayload;
          const anomaly = this.reconstructAnomalyFromPayload(payload);
          this.anomalies.set(anomaly.id, anomaly);
          anomalies.push(anomaly);
        }

        return this.applyFilters(anomalies, filter);
      } catch (error) {
        console.error('[AnomalyDetectionService] Failed to get anomalies from Qdrant:', error instanceof Error ? error.message : error);
      }
    }

      const results: DetectedAnomaly[] = [];
      for (const anomaly of this.anomalies.values()) {
        results.push(anomaly);
      }
      return this.applyFilters(results, filter);
    }

    /**
     * Get a specific anomaly by ID
     */
    getAnomaly(id: string): DetectedAnomaly | undefined {
    return this.anomalies.get(id);
  }

  /**
   * Get count of anomalies
   */
  getAnomalyCount(): number {
    return this.anomalies.size;
  }

  /**
   * Clear all anomalies (for testing)
   */
  clearAnomalies(): void {
    this.anomalies.clear();
  }

    private createAnomaly(
      type: AnomalyType,
      severity: AnomalySeverity,
      entityType: string,
      entityId: string,
      company: string,
      description: string,
      evidence: AnomalyEvidence[],
    ): DetectedAnomaly {
      const anomaly: DetectedAnomaly = {
      id: randomUUID(),
      type,
      severity,
      entityType,
      entityId,
      company,
      description,
      evidence,
      detectedAt: new Date(),
      status: 'open',
    };

    this.anomalies.set(anomaly.id, anomaly);
    this.storeInQdrant(anomaly).catch(err => {
      console.error('[AnomalyDetectionService] Failed to store anomaly:', err);
    });

    console.log(`[AnomalyDetectionService] Created anomaly: ${anomaly.id} (${type}, ${severity})`);

    return anomaly;
  }

  private async storeInQdrant(anomaly: DetectedAnomaly): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      const dummyVector = this.createDummyVector(anomaly);

      const point = {
        id: this.hashAnomalyId(anomaly.id),
        vector: dummyVector,
        payload: {
          anomalyId: anomaly.id,
          type: anomaly.type,
          severity: anomaly.severity,
          entityType: anomaly.entityType,
          entityId: anomaly.entityId,
          company: anomaly.company,
          description: anomaly.description,
          evidence: JSON.stringify(anomaly.evidence),
          detectedAt: anomaly.detectedAt.toISOString(),
          status: anomaly.status,
          acknowledgedAt: anomaly.acknowledgedAt?.toISOString() || null,
          acknowledgedBy: anomaly.acknowledgedBy || null,
          resolvedAt: anomaly.resolvedAt?.toISOString() || null,
          resolvedBy: anomaly.resolvedBy || null,
        } as AnomalyPayload,
      };

      await client.upsert(this.collectionName, [point]);
      return true;
    } catch (error) {
      console.error('[AnomalyDetectionService] Failed to store anomaly:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  private reconstructAnomalyFromPayload(payload: AnomalyPayload): DetectedAnomaly {
    return {
      id: payload.anomalyId,
      type: payload.type as AnomalyType,
      severity: payload.severity as AnomalySeverity,
      entityType: payload.entityType,
      entityId: payload.entityId,
      company: payload.company,
      description: payload.description,
      evidence: JSON.parse(payload.evidence),
      detectedAt: new Date(payload.detectedAt),
      status: payload.status as AnomalyStatus,
      acknowledgedAt: payload.acknowledgedAt ? new Date(payload.acknowledgedAt) : undefined,
      acknowledgedBy: payload.acknowledgedBy || undefined,
      resolvedAt: payload.resolvedAt ? new Date(payload.resolvedAt) : undefined,
      resolvedBy: payload.resolvedBy || undefined,
    };
  }

  private applyFilters(anomalies: DetectedAnomaly[], filter?: AnomalyFilter): DetectedAnomaly[] {
    if (!filter) return anomalies;

    return anomalies.filter(a => {
      if (filter.company && a.company !== filter.company) return false;
      if (filter.type && a.type !== filter.type) return false;
      if (filter.status && a.status !== filter.status) return false;
      if (filter.severity && a.severity !== filter.severity) return false;
      return true;
    });
  }

  private createDummyVector(anomaly: DetectedAnomaly): number[] {
    const typeHash = this.simpleHash(anomaly.type);
    const companyHash = this.simpleHash(anomaly.company);
    const severityHash = this.simpleHash(anomaly.severity);
    const statusHash = this.simpleHash(anomaly.status);

    return [
      (typeHash % 1000) / 1000,
      (companyHash % 1000) / 1000,
      (severityHash % 1000) / 1000,
      (statusHash % 1000) / 1000,
    ];
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private hashAnomalyId(id: string): number {
    return this.simpleHash(id);
  }

  private calculateBurstSeverity(count: number): AnomalySeverity {
    if (count > 50) return 'high';
    if (count > 30) return 'medium';
    return 'low';
  }

  private calculateQualitySeverity(ratio: number): AnomalySeverity {
    if (ratio > 0.8) return 'high';
    if (ratio > 0.65) return 'medium';
    return 'low';
  }

  private calculateDuplicateSeverity(count: number): AnomalySeverity {
    if (count > 10) return 'high';
    if (count > 5) return 'medium';
    return 'low';
  }

  private getUniqueCompanies(): string[] {
    const companies = new Set<string>();
    for (const pattern of this.patternLibrary.getAllPatterns()) {
      if (pattern.company) {
        companies.add(pattern.company);
      }
    }
    return Array.from(companies);
  }

  getBurstThreshold(): number {
    return AnomalyDetectionService.BURST_THRESHOLD;
  }

  getLowQualityThreshold(): number {
    return AnomalyDetectionService.LOW_QUALITY_THRESHOLD;
  }
}
