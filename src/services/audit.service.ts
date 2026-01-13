/**
 * CEDA-43: Audit Service
 *
 * Logs audit events for adversarial hardening and compliance.
 * Stores events in Qdrant collection for persistence and search.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type AuditAction =
  | 'pattern_created'
  | 'pattern_graduated'
  | 'pattern_deleted'
  | 'observation_captured'
  | 'decay_job_executed'
  | 'scheduled_decay_job'
  | 'document_created'
  | 'document_deleted';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  action: AuditAction;
  entityId: string;
  company: string;
  user: string;
  details: Record<string, unknown>;
  ip: string;
}

interface AuditEventPayload {
  auditId: string;
  timestamp: string;
  action: string;
  entityId: string;
  company: string;
  user: string;
  details: string;
  ip: string;
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

    console.log(`[AuditService] ${method} ${url}`);

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
export class AuditService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'ceda_audit';
  private readonly vectorSize = 4;
  private events: Map<string, AuditEvent> = new Map();
  private initialized = false;

  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[AuditService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);

    if (!qdrantUrl) {
      console.warn('[AuditService] QDRANT_URL not set - audit storage in memory only');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[AuditService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[AuditService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
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
      console.warn('[AuditService] Qdrant client not available - using in-memory storage');
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
        console.log(`[AuditService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[AuditService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[AuditService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      this.initialized = true;
      return true;
    }
  }

  /**
   * Log an audit event
   * @param action - The action being audited
   * @param entityId - ID of the entity being acted upon
   * @param company - Company context
   * @param user - User performing the action
   * @param details - Additional details about the action
   * @param ip - Client IP address
   */
  async log(
    action: AuditAction,
    entityId: string,
    company: string,
    user: string,
    details: Record<string, unknown>,
    ip: string,
  ): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      action,
      entityId,
      company,
      user,
      details,
      ip,
    };

    this.events.set(event.id, event);

    await this.storeInQdrant(event);

    console.log(`[AuditService] Logged: ${action} on ${entityId} by ${user}@${company} from ${ip}`);

    return event;
  }

  private async storeInQdrant(event: AuditEvent): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      const dummyVector = this.createDummyVector(event);

      const point = {
        id: this.hashEventId(event.id),
        vector: dummyVector,
        payload: {
          auditId: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entityId: event.entityId,
          company: event.company,
          user: event.user,
          details: JSON.stringify(event.details),
          ip: event.ip,
        } as AuditEventPayload,
      };

      await client.upsert(this.collectionName, [point]);
      return true;
    } catch (error) {
      console.error('[AuditService] Failed to store audit event:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  private createDummyVector(event: AuditEvent): number[] {
    const actionHash = this.simpleHash(event.action);
    const companyHash = this.simpleHash(event.company);
    const userHash = this.simpleHash(event.user);
    const entityHash = this.simpleHash(event.entityId);

    return [
      (actionHash % 1000) / 1000,
      (companyHash % 1000) / 1000,
      (userHash % 1000) / 1000,
      (entityHash % 1000) / 1000,
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

  private hashEventId(id: string): number {
    return this.simpleHash(id);
  }

  /**
   * Get audit events for a company
   * @param company - Company to filter by
   * @param limit - Maximum number of events to return
   */
  async getEvents(company?: string, limit: number = 100): Promise<AuditEvent[]> {
    const client = this.getClient();

    if (client && this.initialized) {
      try {
        const filter = company
          ? { must: [{ key: 'company', match: { value: company } }] }
          : undefined;

        const result = await client.scroll(this.collectionName, filter, limit);

        const events: AuditEvent[] = [];
        for (const point of result.points) {
          const payload = point.payload as AuditEventPayload;
          events.push({
            id: payload.auditId,
            timestamp: new Date(payload.timestamp),
            action: payload.action as AuditAction,
            entityId: payload.entityId,
            company: payload.company,
            user: payload.user,
            details: JSON.parse(payload.details),
            ip: payload.ip,
          });
        }

        return events;
      } catch (error) {
        console.error('[AuditService] Failed to get events from Qdrant:', error instanceof Error ? error.message : error);
      }
    }

    const results: AuditEvent[] = [];
    for (const event of this.events.values()) {
      if (!company || event.company === company) {
        results.push(event);
      }
    }
    return results.slice(0, limit);
  }

  /**
   * Get a specific audit event by ID
   * @param id - Event ID
   */
  getEvent(id: string): AuditEvent | undefined {
    return this.events.get(id);
  }

  /**
   * Get count of audit events
   */
  getEventCount(): number {
    return this.events.size;
  }

  /**
   * Clear all events (for testing)
   */
  clearEvents(): void {
    this.events.clear();
  }
}
