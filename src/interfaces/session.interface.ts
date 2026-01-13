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
 */
export interface Session {
  /** Unique session ID */
  id: string;
  /** Company identifier for multi-tenant filtering */
  company: string;
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
 */
export interface CreateSessionRequest {
  /** Optional session ID (auto-generated if not provided) */
  id?: string;
  /** Company identifier (required) */
  company: string;
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
 */
export interface SessionListFilter {
  /** Filter by company */
  company?: string;
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
