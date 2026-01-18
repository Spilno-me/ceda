/**
 * CEDA-46: Session History Service - Manages version history for sessions
 *
 * Tracks changes to sessions over time, enabling:
 * - Version snapshots on each change
 * - History retrieval
 * - Rollback to previous versions
 * - Diff comparison between versions
 * - Automatic pruning to keep last 10 versions
 */

import { Injectable } from '@nestjs/common';
import {
  Session,
  SessionVersion,
  SessionChangeType,
  SessionDiff,
  SessionFieldChange,
  SessionRollbackResult,
  SessionHistoryResponse,
  SessionStatus,
} from '../interfaces';

/**
 * Qdrant payload structure for session history storage
 */
interface SessionHistoryVector {
  id: number;
  vector: number[];
  payload: {
    versionId: string;
    sessionId: string;
    version: number;
    snapshot: string;
    changeType: SessionChangeType;
    changedFields: string;
    timestamp: string;
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

    console.log(`[SessionHistoryService] ${method} ${url}`);

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
}

@Injectable()
export class SessionHistoryService {
  private client: QdrantHttpClient | null = null;
  private clientInitialized = false;
  private readonly collectionName = 'ceda_session_history';
  private versions: Map<string, SessionVersion[]> = new Map();
  private initialized = false;

  private readonly maxVersionsPerSession = 10;
  private readonly vectorSize = 4;

  private getClient(): QdrantHttpClient | null {
    if (this.clientInitialized) {
      return this.client;
    }

    const qdrantUrl = process.env.QDRANT_URL || process.env.VECTOR_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY || process.env.VECTOR_KEY;

    console.log(`[SessionHistoryService] Lazy init - QDRANT_URL: ${qdrantUrl || 'NOT SET'}`);

    if (!qdrantUrl) {
      console.warn('[SessionHistoryService] QDRANT_URL not set - history persistence disabled, using in-memory');
      this.clientInitialized = true;
      return null;
    }

    try {
      this.client = new QdrantHttpClient(qdrantUrl, qdrantApiKey);
      this.clientInitialized = true;
      console.log(`[SessionHistoryService] Client initialized for: ${qdrantUrl}`);
    } catch (error) {
      console.warn('[SessionHistoryService] Failed to initialize Qdrant client:', error instanceof Error ? error.message : error);
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
      console.warn('[SessionHistoryService] Qdrant client not available - using in-memory storage');
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
        console.log(`[SessionHistoryService] Created collection: ${this.collectionName}`);
      } else {
        console.log(`[SessionHistoryService] Collection exists: ${this.collectionName}`);
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[SessionHistoryService] Failed to initialize collection:', error instanceof Error ? error.message : error);
      this.initialized = true;
      return true;
    }
  }

  /**
   * Record a new version of a session
   */
  async recordVersion(
    session: Session,
    changeType: SessionChangeType,
    changedFields: string[],
  ): Promise<SessionVersion> {
    const sessionVersions = this.versions.get(session.id) || [];
    const nextVersion = sessionVersions.length > 0
      ? Math.max(...sessionVersions.map(v => v.version)) + 1
      : 1;

    const version: SessionVersion = {
      id: this.generateVersionId(session.id, nextVersion),
      sessionId: session.id,
      version: nextVersion,
      snapshot: this.cloneSession(session),
      changeType,
      changedFields,
      timestamp: new Date(),
    };

    sessionVersions.push(version);
    this.versions.set(session.id, sessionVersions);

    await this.storeInQdrant(version);
    await this.pruneHistory(session.id);

    console.log(`[SessionHistoryService] Recorded version ${nextVersion} for session ${session.id} (${changeType})`);

    return this.cloneVersion(version);
  }

  /**
   * Get version history for a session
   */
  async getHistory(sessionId: string, limit?: number): Promise<SessionHistoryResponse> {
    let sessionVersions = this.versions.get(sessionId);

    if (!sessionVersions || sessionVersions.length === 0) {
      sessionVersions = await this.retrieveFromQdrant(sessionId);
      if (sessionVersions.length > 0) {
        this.versions.set(sessionId, sessionVersions);
      }
    }

    const sortedVersions = [...sessionVersions].sort((a, b) => b.version - a.version);
    const limitedVersions = limit ? sortedVersions.slice(0, limit) : sortedVersions;
    const currentVersion = sortedVersions.length > 0 ? sortedVersions[0].version : 0;

    return {
      sessionId,
      versions: limitedVersions,
      totalVersions: sessionVersions.length,
      currentVersion,
      timestamp: new Date(),
    };
  }

  /**
   * Get a specific version of a session
   */
  async getVersion(sessionId: string, versionNumber: number): Promise<SessionVersion | null> {
    let sessionVersions = this.versions.get(sessionId);

    if (!sessionVersions || sessionVersions.length === 0) {
      sessionVersions = await this.retrieveFromQdrant(sessionId);
      if (sessionVersions.length > 0) {
        this.versions.set(sessionId, sessionVersions);
      }
    }

    const version = sessionVersions.find(v => v.version === versionNumber);
    return version ? this.cloneVersion(version) : null;
  }

  /**
   * Rollback a session to a previous version
   * Returns the restored session state and creates a new version entry
   */
  async rollback(
    sessionId: string,
    targetVersion: number,
    updateSessionCallback: (session: Session) => Promise<Session | null>,
  ): Promise<SessionRollbackResult | null> {
    const targetVersionData = await this.getVersion(sessionId, targetVersion);
    if (!targetVersionData) {
      console.error(`[SessionHistoryService] Version ${targetVersion} not found for session ${sessionId}`);
      return null;
    }

    const restoredSession = this.cloneSession(targetVersionData.snapshot);
    restoredSession.updatedAt = new Date();

    const updatedSession = await updateSessionCallback(restoredSession);
    if (!updatedSession) {
      console.error(`[SessionHistoryService] Failed to update session ${sessionId} during rollback`);
      return null;
    }

    const newVersion = await this.recordVersion(
      updatedSession,
      'updated',
      ['rollback'],
    );

    console.log(`[SessionHistoryService] Rolled back session ${sessionId} to version ${targetVersion}, new version: ${newVersion.version}`);

    return {
      success: true,
      sessionId,
      rolledBackToVersion: targetVersion,
      newVersion: newVersion.version,
      session: updatedSession,
      timestamp: new Date(),
    };
  }

  /**
   * Compare two versions of a session
   */
  async diff(sessionId: string, v1: number, v2: number): Promise<SessionDiff | null> {
    const version1 = await this.getVersion(sessionId, v1);
    const version2 = await this.getVersion(sessionId, v2);

    if (!version1 || !version2) {
      console.error(`[SessionHistoryService] Cannot diff: version ${!version1 ? v1 : v2} not found for session ${sessionId}`);
      return null;
    }

    const changes: SessionFieldChange[] = [];
    const changedFields: string[] = [];

    // CEDA-96: Use org instead of company
    const fieldsToCompare: (keyof Session)[] = [
      'org',
      'project',
      'user',
      'context',
      'messages',
      'status',
      'originalSignal',
      'currentPrediction',
      'participants',
    ];

    for (const field of fieldsToCompare) {
      const oldValue = version1.snapshot[field];
      const newValue = version2.snapshot[field];

      if (!this.deepEqual(oldValue, newValue)) {
        changedFields.push(field);
        changes.push({
          field,
          oldValue,
          newValue,
        });
      }
    }

    return {
      sessionId,
      fromVersion: v1,
      toVersion: v2,
      changedFields,
      changes,
      timestamp: new Date(),
    };
  }

  /**
   * Prune history to keep only the last N versions
   */
  async pruneHistory(sessionId: string): Promise<number> {
    const sessionVersions = this.versions.get(sessionId) || [];

    if (sessionVersions.length <= this.maxVersionsPerSession) {
      return 0;
    }

    const sortedVersions = [...sessionVersions].sort((a, b) => b.version - a.version);
    const versionsToKeep = sortedVersions.slice(0, this.maxVersionsPerSession);
    const versionsToDelete = sortedVersions.slice(this.maxVersionsPerSession);

    this.versions.set(sessionId, versionsToKeep);

    const client = this.getClient();
    if (client && this.initialized) {
      const pointIds = versionsToDelete.map(v => this.hashVersionId(v.id));
      try {
        await client.delete(this.collectionName, pointIds);
        console.log(`[SessionHistoryService] Pruned ${versionsToDelete.length} versions for session ${sessionId}`);
      } catch (error) {
        console.error('[SessionHistoryService] Failed to prune from Qdrant:', error instanceof Error ? error.message : error);
      }
    }

    return versionsToDelete.length;
  }

  /**
   * Get the current version number for a session
   */
  getCurrentVersion(sessionId: string): number {
    const sessionVersions = this.versions.get(sessionId) || [];
    if (sessionVersions.length === 0) {
      return 0;
    }
    return Math.max(...sessionVersions.map(v => v.version));
  }

  /**
   * Delete all history for a session
   */
  async deleteHistory(sessionId: string): Promise<boolean> {
    const sessionVersions = this.versions.get(sessionId) || [];
    this.versions.delete(sessionId);

    const client = this.getClient();
    if (client && this.initialized && sessionVersions.length > 0) {
      const pointIds = sessionVersions.map(v => this.hashVersionId(v.id));
      try {
        await client.delete(this.collectionName, pointIds);
        console.log(`[SessionHistoryService] Deleted all history for session ${sessionId}`);
      } catch (error) {
        console.error('[SessionHistoryService] Failed to delete history from Qdrant:', error instanceof Error ? error.message : error);
        return false;
      }
    }

    return true;
  }

  /**
   * Store version in Qdrant
   */
  private async storeInQdrant(version: SessionVersion): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    if (!this.initialized) {
      const initSuccess = await this.initialize();
      if (!initSuccess) return false;
    }

    try {
      const point: SessionHistoryVector = {
        id: this.hashVersionId(version.id),
        vector: this.generateDummyVector(),
        payload: {
          versionId: version.id,
          sessionId: version.sessionId,
          version: version.version,
          snapshot: JSON.stringify(this.serializeSession(version.snapshot)),
          changeType: version.changeType,
          changedFields: JSON.stringify(version.changedFields),
          timestamp: version.timestamp.toISOString(),
        },
      };

      await client.upsert(this.collectionName, [point]);
      console.log(`[SessionHistoryService] Stored version ${version.version} for session ${version.sessionId} in Qdrant`);
      return true;
    } catch (error) {
      console.error('[SessionHistoryService] Failed to store version:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Retrieve versions from Qdrant
   */
  private async retrieveFromQdrant(sessionId: string): Promise<SessionVersion[]> {
    const client = this.getClient();
    if (!client || !this.initialized) {
      return [];
    }

    try {
      const filter: QdrantFilter = {
        must: [{ key: 'sessionId', match: { value: sessionId } }],
      };

      const result = await client.scroll(this.collectionName, filter, 100);
      const versions: SessionVersion[] = [];

      for (const point of result.points) {
        const payload = point.payload as SessionHistoryVector['payload'];
        versions.push(this.reconstructVersionFromPayload(payload));
      }

      return versions.sort((a, b) => a.version - b.version);
    } catch (error) {
      console.error('[SessionHistoryService] Failed to retrieve from Qdrant:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Reconstruct version from Qdrant payload
   */
  private reconstructVersionFromPayload(payload: SessionHistoryVector['payload']): SessionVersion {
    const snapshotData = JSON.parse(payload.snapshot);
    return {
      id: payload.versionId,
      sessionId: payload.sessionId,
      version: payload.version,
      snapshot: this.deserializeSession(snapshotData),
      changeType: payload.changeType,
      changedFields: JSON.parse(payload.changedFields),
      timestamp: new Date(payload.timestamp),
    };
  }

  /**
   * Serialize session for storage (convert Dates to ISO strings)
   */
  private serializeSession(session: Session): Record<string, unknown> {
    return {
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      messages: session.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
      context: session.context.map(c => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
      })),
    };
  }

  /**
   * Deserialize session from storage (convert ISO strings to Dates)
   */
  private deserializeSession(data: Record<string, unknown>): Session {
    const messages = (data.messages as Array<Record<string, unknown>>).map(m => ({
      ...m,
      timestamp: new Date(m.timestamp as string),
    }));

    const context = (data.context as Array<Record<string, unknown>>).map(c => ({
      ...c,
      timestamp: new Date(c.timestamp as string),
    }));

    // CEDA-96: Map stored 'company' field to Session 'org' field
    // Support both old data (company) and new data (org)
    return {
      id: data.id as string,
      org: (data.org || data.company) as string,
      project: data.project as string,
      user: data.user as string,
      context: context as Session['context'],
      messages: messages as Session['messages'],
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
      expiresAt: new Date(data.expiresAt as string),
      status: data.status as SessionStatus,
      originalSignal: data.originalSignal as string,
      currentPrediction: data.currentPrediction as Session['currentPrediction'],
      participants: data.participants as string[],
    };
  }

  /**
   * Deep clone a session
   */
  private cloneSession(session: Session): Session {
    return {
      ...session,
      context: session.context.map(c => ({ ...c, timestamp: new Date(c.timestamp) })),
      messages: session.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
        prediction: m.prediction ? { ...m.prediction } : null,
      })),
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
      expiresAt: new Date(session.expiresAt),
      currentPrediction: session.currentPrediction ? { ...session.currentPrediction } : null,
      participants: [...session.participants],
    };
  }

  /**
   * Deep clone a version (for returning isolated copies)
   */
  private cloneVersion(version: SessionVersion): SessionVersion {
    return {
      ...version,
      snapshot: this.cloneSession(version.snapshot),
      changedFields: [...version.changedFields],
      timestamp: new Date(version.timestamp),
    };
  }

  /**
   * Deep equality check for comparing values
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key =>
        this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      );
    }

    return false;
  }

  /**
   * Generate a unique version ID
   */
  private generateVersionId(sessionId: string, version: number): string {
    return `${sessionId}_v${version}_${Date.now()}`;
  }

  /**
   * Hash version ID to numeric ID for Qdrant
   */
  private hashVersionId(id: string): number {
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
