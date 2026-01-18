/**
 * CEDA-45: Session Persistence Interfaces
 *
 * Defines types for persisting conversation sessions to Qdrant.
 * Sessions track multi-turn interactions with context accumulation.
 */

import { ContextSignal } from './signal.interface';
import { StructurePrediction } from './prediction.interface';

/**
 * Session status for lifecycle management
 */
export type SessionStatus = 'active' | 'archived' | 'expired';

/**
 * A message in a session conversation
 */
export interface SessionMessage {
  /** Turn number in the conversation */
  turn: number;
  /** Timestamp of the message */
  timestamp: Date;
  /** Input text from user */
  input: string;
  /** Type of input */
  inputType: 'signal' | 'refinement' | 'context';
  /** Participant identifier (for 5 hats model) */
  participant?: string;
  /** Prediction generated for this turn */
  prediction: StructurePrediction | null;
  /** Confidence score of the prediction */
  confidence: number;
}

/**
 * Persistent session stored in Qdrant
 * CEDA-96: Renamed company to org for Git-native naming
 */
export interface Session {
  /** Unique session ID */
  id: string;
  /** Org identifier for multi-tenant filtering (CEDA-96: renamed from company) */
  org: string;
  /** Project identifier */
  project: string;
  /** User identifier */
  user: string;
  /** Accumulated context from all participants */
  context: ContextSignal[];
  /** Conversation messages (max 100) */
  messages: SessionMessage[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Expiration timestamp (TTL) */
  expiresAt: Date;
  /** Session status */
  status: SessionStatus;
  /** Original signal that started the session */
  originalSignal: string;
  /** Current/latest prediction */
  currentPrediction: StructurePrediction | null;
  /** Participants who contributed (for 5 hats model) */
  participants: string[];
}

/**
 * Request payload for creating a new session
 * CEDA-96: Renamed company to org for Git-native naming
 */
export interface CreateSessionRequest {
  /** Optional session ID (auto-generated if not provided) */
  id?: string;
  /** Org identifier (required) */
  org: string;
  /** Project identifier */
  project?: string;
  /** User identifier */
  user?: string;
  /** Original signal that starts the session */
  originalSignal?: string;
  /** Initial context */
  context?: ContextSignal[];
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs?: number;
}

/**
 * Request payload for updating a session
 */
export interface UpdateSessionRequest {
  /** Update current prediction */
  currentPrediction?: StructurePrediction | null;
  /** Update context */
  context?: ContextSignal[];
  /** Update participants */
  participants?: string[];
  /** Update status */
  status?: SessionStatus;
}

/**
 * Filter options for listing sessions
 * CEDA-96: Renamed company to org for Git-native naming
 */
export interface SessionListFilter {
  /** Filter by org */
  org?: string;
  /** Filter by project */
  project?: string;
  /** Filter by user */
  user?: string;
  /** Filter by status */
  status?: SessionStatus;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Response from session cleanup operation
 */
export interface SessionCleanupResult {
  /** Number of sessions expired */
  expiredCount: number;
  /** Number of sessions archived */
  archivedCount: number;
  /** IDs of expired sessions */
  expiredIds: string[];
  /** IDs of archived sessions */
  archivedIds: string[];
  /** Timestamp of cleanup */
  timestamp: Date;
}

/**
 * Session summary for API responses
 */
export interface SessionSummary {
  /** Session ID */
  sessionId: string;
  /** Number of turns/messages */
  turns: number;
  /** Participants in the session */
  participants: string[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Whether session has a current prediction */
  hasCurrentPrediction: boolean;
  /** Session status */
  status: SessionStatus;
}

/**
 * CEDA-46: Session History and Versioning Interfaces
 */

/**
 * Type of change that triggered a new version
 */
export type SessionChangeType = 'created' | 'updated' | 'message_added' | 'context_changed';

/**
 * A version snapshot of a session
 */
export interface SessionVersion {
  /** Unique version ID */
  id: string;
  /** Reference to parent session */
  sessionId: string;
  /** Version number (1, 2, 3, ...) */
  version: number;
  /** Full session state at this version */
  snapshot: Session;
  /** Type of change that created this version */
  changeType: SessionChangeType;
  /** Fields that changed from previous version */
  changedFields: string[];
  /** When this version was created */
  timestamp: Date;
}

/**
 * Diff between two session versions
 */
export interface SessionDiff {
  /** Session ID */
  sessionId: string;
  /** First version number */
  fromVersion: number;
  /** Second version number */
  toVersion: number;
  /** Fields that changed */
  changedFields: string[];
  /** Detailed changes per field */
  changes: SessionFieldChange[];
  /** Timestamp of diff generation */
  timestamp: Date;
}

/**
 * A single field change between versions
 */
export interface SessionFieldChange {
  /** Field name */
  field: string;
  /** Value in first version */
  oldValue: unknown;
  /** Value in second version */
  newValue: unknown;
}

/**
 * Result of a rollback operation
 */
export interface SessionRollbackResult {
  /** Whether rollback was successful */
  success: boolean;
  /** Session ID */
  sessionId: string;
  /** Version rolled back to */
  rolledBackToVersion: number;
  /** New version number after rollback */
  newVersion: number;
  /** Restored session state */
  session: Session;
  /** Timestamp of rollback */
  timestamp: Date;
}

/**
 * Session history list response
 */
export interface SessionHistoryResponse {
  /** Session ID */
  sessionId: string;
  /** List of versions */
  versions: SessionVersion[];
  /** Total version count */
  totalVersions: number;
  /** Current version number */
  currentVersion: number;
  /** Timestamp of response */
  timestamp: Date;
}
