/**
 * CEDA-36: Pattern Graduation Interfaces
 *
 * Defines types for pattern graduation from observations to shared patterns.
 * Patterns evolve through levels based on usage and acceptance criteria.
 */

import { PatternLevel } from './pattern.interface';

/**
 * Result of checking if a pattern can graduate
 */
export interface GraduationResult {
  /** Whether the pattern can graduate to the next level */
  canGraduate: boolean;
  /** Target level if graduation is possible */
  toLevel?: PatternLevel;
  /** Whether admin approval is required (for level 2 -> 3) */
  requiresApproval?: boolean;
  /** Current graduation statistics */
  stats?: GraduationStats;
  /** Reason if graduation is not possible */
  reason?: string;
}

/**
 * Statistics used for graduation evaluation
 */
export interface GraduationStats {
  /** Total number of observations */
  totalObservations: number;
  /** Number of unique users who used this pattern */
  uniqueUsers: number;
  /** Number of unique companies using this pattern */
  uniqueCompanies: number;
  /** Acceptance rate (accepted / total) */
  acceptanceRate: number;
  /** Modification rate (modified / total) */
  modificationRate: number;
  /** Rejection rate (rejected / total) */
  rejectionRate: number;
}

/**
 * Criteria for graduating from Observation (0) to Local (1)
 */
export interface LocalGraduationCriteria {
  /** Minimum number of observations required */
  minObservations: number;
  /** Minimum acceptance rate (0.0 - 1.0) */
  minAcceptanceRate: number;
  /** Maximum modification rate (0.0 - 1.0) */
  maxModificationRate: number;
  /** Must be from the same user */
  sameUser: boolean;
  /** Must be from the same company */
  sameCompany: boolean;
}

/**
 * Criteria for graduating from Local (1) to Company (2)
 */
export interface CompanyGraduationCriteria {
  /** Minimum number of unique users */
  minUsers: number;
  /** Minimum acceptance rate (0.0 - 1.0) */
  minAcceptanceRate: number;
  /** Maximum modification rate (0.0 - 1.0) */
  maxModificationRate: number;
  /** Must be from the same company */
  sameCompany: boolean;
  /** Whether admin approval is required */
  adminApproval: boolean;
}

/**
 * Criteria for graduating from Company (2) to Shared (3)
 */
export interface SharedGraduationCriteria {
  /** Minimum number of unique companies */
  minCompanies: number;
  /** Minimum acceptance rate (0.0 - 1.0) */
  minAcceptanceRate: number;
  /** Maximum modification rate (0.0 - 1.0) */
  maxModificationRate: number;
  /** Whether admin approval is required */
  adminApproval: boolean;
  /** Whether to anonymize company-specific data */
  anonymization: boolean;
}

/**
 * Default graduation criteria configuration
 */
export const DEFAULT_GRADUATION_CRITERIA = {
  local: {
    minObservations: 3,
    minAcceptanceRate: 0.7,
    maxModificationRate: 0.3,
    sameUser: true,
    sameCompany: true,
  } as LocalGraduationCriteria,
  company: {
    minUsers: 5,
    minAcceptanceRate: 0.8,
    maxModificationRate: 0.2,
    sameCompany: true,
    adminApproval: false,
  } as CompanyGraduationCriteria,
  shared: {
    minCompanies: 3,
    minAcceptanceRate: 0.9,
    maxModificationRate: 0.1,
    adminApproval: true,
    anonymization: true,
  } as SharedGraduationCriteria,
};

/**
 * Graduation candidate for admin review
 */
export interface GraduationCandidate {
  /** Pattern ID */
  patternId: string;
  /** Pattern name */
  patternName: string;
  /** Current level */
  currentLevel: PatternLevel;
  /** Target level */
  targetLevel: PatternLevel;
  /** Graduation statistics */
  stats: GraduationStats;
  /** When the pattern became eligible for graduation */
  eligibleSince: Date;
}

/**
 * Request to approve graduation (admin action)
 */
export interface ApproveGraduationRequest {
  /** Pattern ID to approve */
  patternId: string;
  /** Admin user ID */
  adminUserId: string;
  /** Optional comment */
  comment?: string;
}

/**
 * Response from graduation approval
 */
export interface ApproveGraduationResponse {
  /** Whether approval was successful */
  success: boolean;
  /** Pattern ID */
  patternId: string;
  /** New level after graduation */
  newLevel: PatternLevel;
  /** Timestamp of graduation */
  graduatedAt: Date;
  /** Whether anonymization was applied */
  anonymized: boolean;
}

/**
 * Graduation status for a pattern
 */
export interface GraduationStatus {
  /** Pattern ID */
  patternId: string;
  /** Current level */
  currentLevel: PatternLevel;
  /** Current statistics */
  stats: GraduationStats;
  /** Whether pattern can graduate */
  canGraduate: boolean;
  /** Target level if can graduate */
  nextLevel?: PatternLevel;
  /** Whether admin approval is required */
  requiresApproval?: boolean;
  /** Progress towards next level (0.0 - 1.0) */
  progress: number;
  /** Missing criteria for graduation */
  missingCriteria?: string[];
}
