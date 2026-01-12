/**
 * CEDA-35: Observation Capture Interfaces
 *
 * Defines types for capturing pattern observations from Herald sessions.
 * Observations track what was predicted, what happened (accepted/modified/rejected),
 * and any modifications made - enabling the learning loop.
 */

import { StructurePrediction } from './prediction.interface';

/**
 * Outcome of a prediction observation
 */
export type ObservationOutcome = 'accepted' | 'modified' | 'rejected';

/**
 * Source of an observation - how it was created
 */
export type ObservationSource = 'live' | 'direct';

/**
 * Type of modification made to a prediction
 */
export type ModificationType = 'add' | 'remove' | 'change';

/**
 * Record of a single modification between prediction and final structure
 */
export interface Modification {
  /** Type of modification */
  type: ModificationType;
  /** JSON path to the modified element (e.g., "sections[0].fields[2]") */
  path: string;
  /** Value before modification (undefined for 'add') */
  before?: unknown;
  /** Value after modification (undefined for 'remove') */
  after?: unknown;
}

/**
 * Full observation record for learning loop
 */
export interface Observation {
  /** Unique observation ID */
  id: string;
  /** Session ID from Herald */
  sessionId: string;
  /** Company identifier for multi-tenant filtering */
  company: string;
  /** Project identifier */
  project: string;
  /** User identifier */
  user: string;

  /** Pattern ID that was matched */
  patternId: string;
  /** Pattern name for display */
  patternName: string;
  /** The prediction that was generated */
  prediction: StructurePrediction;

  /** Outcome of the prediction */
  outcome: ObservationOutcome;
  /** List of modifications made (empty if accepted as-is) */
  modifications: Modification[];
  /** Optional user feedback text */
  feedback?: string;

  /** Original input that triggered the prediction */
  input: string;
  /** Confidence score of the prediction */
  confidence: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Timestamp of the observation */
  timestamp: Date;
  /** Source of the observation - 'live' from Herald session or 'direct' from API */
  source: ObservationSource;
}

/**
 * Request payload for capturing an observation from an existing session
 */
export interface CaptureObservationRequest {
  /** Session ID */
  sessionId: string;
  /** Company identifier */
  company: string;
  /** Project identifier */
  project?: string;
  /** User identifier */
  user?: string;
  /** Outcome of the prediction */
  outcome: ObservationOutcome;
  /** Final structure after modifications (for diff calculation) */
  finalStructure?: StructurePrediction;
  /** Optional user feedback */
  feedback?: string;
}

/**
 * CEDA-39: Request payload for creating a direct observation without a session
 * Used for POST /api/observations endpoint
 */
export interface CreateObservationDto {
  /** Original input that triggered the prediction (required) */
  input: string;
  /** Company identifier for multi-tenant filtering (required) */
  company: string;
  /** Project identifier */
  project?: string;
  /** User identifier */
  user?: string;
  /** Pattern ID that was matched */
  patternId?: string;
  /** Pattern name for display */
  patternName?: string;
  /** The prediction structure (required) */
  prediction: StructurePrediction;
  /** Outcome of the prediction (required) */
  outcome: ObservationOutcome;
  /** Final structure after modifications (for diff calculation) */
  finalStructure?: StructurePrediction;
  /** Optional user feedback */
  feedback?: string;
  /** Processing time in milliseconds */
  processingTime?: number;
  /** Confidence score of the prediction */
  confidence?: number;
}

/**
 * Response from capturing an observation
 */
export interface CaptureObservationResponse {
  /** Whether the observation was recorded */
  recorded: boolean;
  /** The observation ID */
  observationId: string;
  /** Session ID */
  sessionId: string;
  /** Number of modifications detected */
  modificationsCount: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Request for finding similar observations
 */
export interface FindSimilarRequest {
  /** Input text to search for */
  input: string;
  /** Company filter */
  company: string;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Statistics for a pattern's observations
 */
export interface PatternObservationStats {
  /** Pattern ID */
  patternId: string;
  /** Total number of observations */
  totalObservations: number;
  /** Count by outcome */
  outcomes: {
    accepted: number;
    modified: number;
    rejected: number;
  };
  /** Acceptance rate (accepted / total) */
  acceptanceRate: number;
  /** Modification rate (modified / total) */
  modificationRate: number;
  /** Rejection rate (rejected / total) */
  rejectionRate: number;
  /** Average confidence score */
  averageConfidence: number;
  /** Average processing time in ms */
  averageProcessingTime: number;
  /** Most common modification types */
  commonModifications: {
    type: ModificationType;
    path: string;
    count: number;
  }[];
}

/**
 * Stored observation with vector embedding info
 */
export interface StoredPatternObservation extends Observation {
  /** Vector ID in Qdrant */
  vectorId: number;
}
