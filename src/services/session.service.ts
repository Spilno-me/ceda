/**
 * CEDA-45: Session Service - Manages conversation state with Qdrant persistence
 *
 * Enables the 5 hats consilium pattern:
 * - Accumulates context across turns
 * - Stores prediction history
 * - Allows refinement without re-stating full context
 * - Persists sessions to Qdrant for durability
 */

import { Injectable } from '@nestjs/common';
import {
  Session,
  SessionMessage,
  SessionStatus,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionListFilter,
  SessionCleanupResult,
  SessionSummary,
  ContextSignal,
  StructurePrediction,
} from '../interfaces';

/**
 * Legacy exports for backward compatibility
 */
export interface SessionState extends Session {}
export interface SessionHistoryEntry extends SessionMessage {}

/**
 * Qdrant payload structure for session storage
 */
interface SessionVector {
  id: number;
  vector: number[];
  payload: {
    sessionId: string;
    company: string;
    project: string;
    user: string;
    context: string;
    messages: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    status: SessionStatus;
    originalSignal: string;
    currentPrediction: string | null;
    participants: string;
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

/**
 * Lightweight Qdrant client using native fetch
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

    console.log(`[SessionService] ${method} ${url}`);

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

  async delete(collection: string, pointIds: number[]): Promise<void> {
    await this.request('POST', `/collections/${collection}/points/delete`, {
      points: pointIds,
    });
  }

  async count(collection: string): Promise<number> {
    const result = await this.request<{ count: number }>('POST', `/collections/${collection}/points/count`, {});
    return result.count;
  }
}

@Injectable()
export class SessionService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'ceda_sessions';
  private sessions: Map<string, Session> = new Map();
  private initialized = false;

  private readonly maxSessions = 1000;
  private readonly defaultTTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxMessages = 100;
  private readonly vectorSize = 4; // Minimal vector size for non-semantic storage

  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[SessionService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);

    if (!qdrantUrl) {
      console.warn('[SessionService] QDRANT_URL not set - session persistence disabled, using in-memory');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[SessionService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[SessionService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
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
      console.warn('[SessionService] Qdrant client not available - using in-memory storage');
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
        console.log(`[SessionService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[SessionService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[SessionService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      this.initialized = true;
      return true;
    }
  }

  /**
   * Create a new session
   */
  async create(request: CreateSessionRequest): Promise<Session> {
    const now = new Date();
    const ttl = request.ttlMs || this.defaultTTL;
    const sessionId = request.id || this.generateId();

    // CEDA-96: Use org instead of company
    const session: Session = {
      id: sessionId,
      org: request.org,
      project: request.project || 'default',
      user: request.user || 'unknown',
      context: request.context || [],
      messages: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      status: 'active',
      originalSignal: request.originalSignal || '',
      currentPrediction: null,
      participants: [],
    };

    this.sessions.set(sessionId, session);
    await this.storeInQdrant(session);
    this.cleanup();

    console.log(`[SessionService] Created session: ${sessionId} (org: ${session.org}, expires: ${session.expiresAt.toISOString()})`);

    return session;
  }

  /**
   * Get or create a session (backward compatibility)
   * CEDA-96: Renamed company parameter to org
   */
  getOrCreate(sessionId: string, originalSignal?: string, org?: string): Session {
    let session = this.sessions.get(sessionId);

    if (!session) {
      const now = new Date();
      session = {
        id: sessionId,
        org: org || 'unknown',
        project: 'default',
        user: 'unknown',
        context: [],
        messages: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + this.defaultTTL),
        status: 'active',
        originalSignal: originalSignal || '',
        currentPrediction: null,
        participants: [],
      };
      this.sessions.set(sessionId, session);
      this.storeInQdrant(session).catch(err => 
        console.error('[SessionService] Failed to store session:', err)
      );
      this.cleanup();
    }

    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);

    if (session && session.status === 'active' && new Date() > session.expiresAt) {
      session.status = 'expired';
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
      this.storeInQdrant(session).catch(err => 
        console.error('[SessionService] Failed to update expired session:', err)
      );
    }

    return session || null;
  }

  /**
   * Get session by ID (async version with Qdrant retrieval)
   */
  async getAsync(sessionId: string): Promise<Session | null> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = await this.retrieveFromQdrant(sessionId) || undefined;
    }

    if (session && session.status === 'active' && new Date() > session.expiresAt) {
      session.status = 'expired';
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
      await this.storeInQdrant(session);
    }

    return session || null;
  }

  /**
   * Update session
   */
  update(sessionId: string, updates: Partial<Pick<Session, 'currentPrediction' | 'context' | 'participants'>> & { status?: SessionStatus }): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (updates.currentPrediction !== undefined) {
      session.currentPrediction = updates.currentPrediction;
    }
    if (updates.context !== undefined) {
      session.context = updates.context;
    }
    if (updates.participants !== undefined) {
      session.participants = updates.participants;
    }
    if (updates.status !== undefined) {
      session.status = updates.status;
    }

    session.updatedAt = new Date();
    this.sessions.set(sessionId, session);
    this.storeInQdrant(session).catch(err => 
      console.error('[SessionService] Failed to update session:', err)
    );

    console.log(`[SessionService] Updated session: ${sessionId}`);

    return session;
  }

  /**
   * Delete session
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);

    const client = this.getClient();
    if (client && this.initialized) {
      const pointId = this.hashSessionId(sessionId);
      client.delete(this.collectionName, [pointId]).catch(err => 
        console.error('[SessionService] Failed to delete from Qdrant:', err)
      );
      console.log(`[SessionService] Deleted session from Qdrant: ${sessionId}`);
    }

    return true;
  }

  /**
   * List sessions with optional filters
   */
  async list(filter?: SessionListFilter): Promise<Session[]> {
    const client = this.getClient();
    if (!client || !this.initialized) {
      return this.listFromMemory(filter);
    }

    try {
      const qdrantFilter = this.buildQdrantFilter(filter);
      const limit = filter?.limit || 100;
      const result = await client.scroll(this.collectionName, qdrantFilter, limit);

      const sessions: Session[] = [];
      for (const point of result.points) {
        const payload = point.payload as SessionVector['payload'];
        const session = this.reconstructSessionFromPayload(payload);
        this.sessions.set(session.id, session);
        sessions.push(session);
      }

      return sessions;
    } catch (error) {
      console.error('[SessionService] Failed to list from Qdrant:', error instanceof Error ? error.message : error);
      return this.listFromMemory(filter);
    }
  }

  /**
   * Archive a session
   */
  archive(sessionId: string): Session | null {
    return this.update(sessionId, { status: 'archived' });
  }

  /**
   * Expire sessions past their TTL
   */
  async expireSessions(): Promise<SessionCleanupResult> {
    const now = new Date();
    const expiredIds: string[] = [];
    const archivedIds: string[] = [];

    const allSessions = await this.list();

    for (const session of allSessions) {
      if (session.status === 'active' && now > session.expiresAt) {
        session.status = 'expired';
        session.updatedAt = now;
        this.sessions.set(session.id, session);
        await this.storeInQdrant(session);
        expiredIds.push(session.id);
      }
    }

    console.log(`[SessionService] Expired ${expiredIds.length} sessions`);

    return {
      expiredCount: expiredIds.length,
      archivedCount: archivedIds.length,
      expiredIds,
      archivedIds,
      timestamp: now,
    };
  }

  /**
   * Add context to session
   */
  addContext(sessionId: string, context: ContextSignal): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context.push(context);
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
      this.storeInQdrant(session).catch(err => 
        console.error('[SessionService] Failed to store context update:', err)
      );
    }
  }

  /**
   * Add participant to session
   */
  addParticipant(sessionId: string, participant: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.participants.includes(participant)) {
      session.participants.push(participant);
      session.updatedAt = new Date();
      this.sessions.set(sessionId, session);
      this.storeInQdrant(session).catch(err => 
        console.error('[SessionService] Failed to store participant update:', err)
      );
    }
  }

  /**
   * Record prediction in session history
   */
  recordPrediction(
    sessionId: string,
    input: string,
    inputType: 'signal' | 'refinement' | 'context',
    prediction: StructurePrediction | null,
    confidence: number,
    participant?: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const message: SessionMessage = {
      turn: session.messages.length + 1,
      timestamp: new Date(),
      input,
      inputType,
      participant,
      prediction,
      confidence,
    };

    session.messages.push(message);

    // Enforce max messages limit
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages);
    }

    session.currentPrediction = prediction;
    session.updatedAt = new Date();

    if (participant && !session.participants.includes(participant)) {
      session.participants.push(participant);
    }

    this.sessions.set(sessionId, session);
    this.storeInQdrant(session).catch(err => 
      console.error('[SessionService] Failed to store prediction:', err)
    );
  }

  /**
   * Get accumulated context for session
   */
  getAccumulatedContext(sessionId: string): ContextSignal[] {
    const session = this.sessions.get(sessionId);
    return session?.context || [];
  }

  /**
   * Get combined signal (original + refinements)
   */
  getCombinedSignal(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    const parts = [session.originalSignal];

    for (const message of session.messages) {
      if (message.inputType === 'refinement') {
        parts.push(message.input);
      }
    }

    return parts.join('. ');
  }

  /**
   * Get session summary for API response
   */
  getSummary(sessionId: string): SessionSummary | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.id,
      turns: session.messages.length,
      participants: session.participants,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      hasCurrentPrediction: !!session.currentPrediction,
      status: session.status,
    };
  }

  /**
   * Get full session state (for Herald)
   */
  getFullState(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Store session in Qdrant
   */
  private async storeInQdrant(session: Session): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      // CEDA-96: Store org as 'company' in Qdrant for backwards compatibility with existing data
      const point: SessionVector = {
        id: this.hashSessionId(session.id),
        vector: this.generateDummyVector(),
        payload: {
          sessionId: session.id,
          company: session.org,
          project: session.project,
          user: session.user,
          context: JSON.stringify(session.context),
          messages: JSON.stringify(session.messages),
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          status: session.status,
          originalSignal: session.originalSignal,
          currentPrediction: session.currentPrediction ? JSON.stringify(session.currentPrediction) : null,
          participants: JSON.stringify(session.participants),
        },
      };

      await client.upsert(this.collectionName, [point]);
      console.log(`[SessionService] Stored session ${session.id} in Qdrant`);
      return true;
    } catch (error) {
      console.error('[SessionService] Failed to store session:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Retrieve session from Qdrant
   */
  private async retrieveFromQdrant(sessionId: string): Promise<Session | null> {
    const client = this.getClient();
    if (!client || !this.initialized) {
      return null;
    }

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'sessionId', match: { value: sessionId } }],
      };

      const result = await client.scroll(this.collectionName, filter, 1);

      if (result.points.length === 0) {
        return null;
      }

      const payload = result.points[0].payload as SessionVector['payload'];
      const session = this.reconstructSessionFromPayload(payload);
      this.sessions.set(session.id, session);

      return session;
    } catch (error) {
      console.error('[SessionService] Failed to retrieve from Qdrant:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Reconstruct session from Qdrant payload
   * CEDA-96: Map Qdrant 'company' field to Session 'org' field
   */
  private reconstructSessionFromPayload(payload: SessionVector['payload']): Session {
    return {
      id: payload.sessionId,
      org: payload.company,
      project: payload.project,
      user: payload.user,
      context: JSON.parse(payload.context),
      messages: JSON.parse(payload.messages),
      createdAt: new Date(payload.createdAt),
      updatedAt: new Date(payload.updatedAt),
      expiresAt: new Date(payload.expiresAt),
      status: payload.status,
      originalSignal: payload.originalSignal,
      currentPrediction: payload.currentPrediction ? JSON.parse(payload.currentPrediction) : null,
      participants: JSON.parse(payload.participants),
    };
  }

  /**
   * Build Qdrant filter from list filter
   * CEDA-96: Use org from filter but query 'company' field in Qdrant for backwards compatibility
   */
  private buildQdrantFilter(filter?: SessionListFilter): QdrantFilter | undefined {
    if (!filter) return undefined;

    const conditions: QdrantCondition[] = [];

    if (filter.org) {
      conditions.push({ key: 'company', match: { value: filter.org } });
    }
    if (filter.project) {
      conditions.push({ key: 'project', match: { value: filter.project } });
    }
    if (filter.user) {
      conditions.push({ key: 'user', match: { value: filter.user } });
    }
    if (filter.status) {
      conditions.push({ key: 'status', match: { value: filter.status } });
    }

    if (conditions.length === 0) return undefined;

    return { must: conditions };
  }

  /**
   * List sessions from memory (fallback)
   * CEDA-96: Use org instead of company for filtering
   */
  private listFromMemory(filter?: SessionListFilter): Session[] {
    const results: Session[] = [];
    const limit = filter?.limit || 100;

    for (const session of this.sessions.values()) {
      if (filter?.org && session.org !== filter.org) continue;
      if (filter?.project && session.project !== filter.project) continue;
      if (filter?.user && session.user !== filter.user) continue;
      if (filter?.status && session.status !== filter.status) continue;

      results.push(session);

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Clean up old sessions to prevent memory leaks
   */
  private cleanup(): void {
    if (this.sessions.size <= this.maxSessions) return;

    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt.getTime() > this.defaultTTL) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.sessions.delete(id);
    }

    if (this.sessions.size > this.maxSessions) {
      const sorted = [...this.sessions.entries()]
        .sort((a, b) => a[1].updatedAt.getTime() - b[1].updatedAt.getTime());

      const deleteCount = this.sessions.size - this.maxSessions;
      for (let i = 0; i < deleteCount; i++) {
        this.sessions.delete(sorted[i][0]);
      }
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Hash session ID to numeric ID for Qdrant
   */
  private hashSessionId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Generate a dummy vector for non-semantic storage
   */
  private generateDummyVector(): number[] {
    return [0.1, 0.1, 0.1, 0.1];
  }
}
