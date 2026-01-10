/**
 * Session Service - Manages conversation state for multi-turn interactions
 *
 * Enables the 5 hats consilium pattern:
 * - Accumulates context across turns
 * - Stores prediction history
 * - Allows refinement without re-stating full context
 */

import { StructurePrediction, ContextSignal } from '../interfaces';

export interface SessionState {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  /** Original signal that started the session */
  originalSignal: string;
  /** Accumulated context from all participants */
  context: ContextSignal[];
  /** History of predictions in this session */
  history: SessionHistoryEntry[];
  /** Current/latest prediction */
  currentPrediction: StructurePrediction | null;
  /** Participants who contributed (for 5 hats model) */
  participants: string[];
}

export interface SessionHistoryEntry {
  turn: number;
  timestamp: Date;
  input: string;
  inputType: 'signal' | 'refinement' | 'context';
  participant?: string;
  prediction: StructurePrediction | null;
  confidence: number;
}

/**
 * In-memory session store (POV version)
 * Production would use Redis or database
 */
export class SessionService {
  private sessions: Map<string, SessionState> = new Map();
  private readonly maxSessions = 1000;
  private readonly sessionTTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Create or get existing session
   */
  getOrCreate(sessionId: string, originalSignal?: string): SessionState {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        createdAt: new Date(),
        updatedAt: new Date(),
        originalSignal: originalSignal || '',
        context: [],
        history: [],
        currentPrediction: null,
        participants: [],
      };
      this.sessions.set(sessionId, session);
      this.cleanup();
    }

    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Add context to session
   */
  addContext(sessionId: string, context: ContextSignal): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context.push(context);
      session.updatedAt = new Date();
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
    }
  }

  /**
   * Record prediction in history
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
    if (session) {
      const entry: SessionHistoryEntry = {
        turn: session.history.length + 1,
        timestamp: new Date(),
        input,
        inputType,
        participant,
        prediction,
        confidence,
      };
      session.history.push(entry);
      session.currentPrediction = prediction;
      session.updatedAt = new Date();

      if (participant) {
        this.addParticipant(sessionId, participant);
      }
    }
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

    for (const entry of session.history) {
      if (entry.inputType === 'refinement') {
        parts.push(entry.input);
      }
    }

    return parts.join('. ');
  }

  /**
   * Get session summary for API response
   */
  getSummary(sessionId: string): object | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.id,
      turns: session.history.length,
      participants: session.participants,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      hasCurrentPrediction: !!session.currentPrediction,
    };
  }

  /**
   * Clear old sessions to prevent memory leaks
   */
  private cleanup(): void {
    if (this.sessions.size <= this.maxSessions) return;

    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt.getTime() > this.sessionTTL) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.sessions.delete(id);
    }

    // If still over limit, delete oldest
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
   * Get active session count (for stats)
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
