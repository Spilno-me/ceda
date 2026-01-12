/**
 * Antipattern Observation Interfaces
 *
 * Defines types for antipattern detection and learning in CEDA.
 * Antipatterns are behavioral patterns that indicate suboptimal approaches
 * during AI-assisted development sessions.
 */

/**
 * Core antipattern definition
 */
export interface Antipattern {
  id: string;
  signal: string;
  context: string;
  escape: string;
  confidence: number;
  source_sessions: string[];
}

/**
 * Session observation from Herald
 */
export interface SessionObservation {
  sessionId: string;
  timestamp: Date;
  behavior: string;
  context: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of antipattern detection
 */
export interface AntipatternMatch {
  antipattern: Antipattern;
  confidence: number;
  matchedSignals: string[];
  suggestedEscape: string;
}

/**
 * Detection request payload
 */
export interface DetectRequest {
  behavior: string;
  context?: string;
  sessionId?: string;
}

/**
 * Detection response
 */
export interface DetectResponse {
  matches: AntipatternMatch[];
  analyzed: boolean;
  timestamp: Date;
}

/**
 * Learning outcome types
 */
export enum LearningOutcome {
  ANTIPATTERN_CONFIRMED = 'antipattern_confirmed',
  PARADIGM_CANDIDATE = 'paradigm_candidate',
}

/**
 * Learn request payload
 */
export interface LearnRequest {
  antipatternId: string;
  sessionId: string;
  outcome: LearningOutcome;
  feedback?: string;
}

/**
 * Learn response
 */
export interface LearnResponse {
  updated: boolean;
  antipatternId: string;
  newConfidence: number;
  outcome: LearningOutcome;
}

/**
 * Observation storage record
 */
export interface StoredObservation extends SessionObservation {
  id: string;
  detectedAntipatterns: string[];
  learningOutcome?: LearningOutcome;
}
