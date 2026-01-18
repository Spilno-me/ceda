/**
 * CEDA-95: Git-Native Graduation Model Interfaces
 *
 * Defines types for pattern graduation through 6 levels:
 * Level 0: Observation (raw herald_reflect capture)
 * Level 1: User Pattern (3+ obs, 70% helpful, same user)
 * Level 2: Project Pattern (3+ users, 80% helpful, same project)
 * Level 3: Org Pattern (3+ projects, 85% helpful, same org)
 * Level 4: Cross-Org (explicit share, 90% helpful)
 * Level 5: Global (admin approved, 95% helpful)
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
  /** Whether admin approval is required (for level 4 -> 5) */
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
  /** Number of unique projects using this pattern */
  uniqueProjects: number;
  /** Number of unique companies/orgs using this pattern */
  uniqueCompanies: number;
  /** Helpful rate (helpful_count / total feedback) - CEDA-95 */
  helpfulRate: number;
  /** Acceptance rate (accepted / total) - legacy, kept for compatibility */
  acceptanceRate: number;
  /** Modification rate (modified / total) */
  modificationRate: number;
  /** Rejection rate (rejected / total) */
  rejectionRate: number;
}

/**
 * Criteria for graduating from Observation (0) to User (1)
 */
export interface UserGraduationCriteria {
  /** Minimum number of observations required */
  minObservations: number;
  /** Minimum helpful rate (0.0 - 1.0) */
  minHelpfulRate: number;
  /** Must be from the same user */
  sameUser: boolean;
}

/**
 * Criteria for graduating from User (1) to Project (2)
 */
export interface ProjectGraduationCriteria {
  /** Minimum number of unique users */
  minUsers: number;
  /** Minimum helpful rate (0.0 - 1.0) */
  minHelpfulRate: number;
  /** Must be from the same project */
  sameProject: boolean;
}

/**
 * Criteria for graduating from Project (2) to Org (3)
 */
export interface OrgGraduationCriteria {
  /** Minimum number of unique projects */
  minProjects: number;
  /** Minimum helpful rate (0.0 - 1.0) */
  minHelpfulRate: number;
  /** Must be from the same org/company */
  sameOrg: boolean;
}

/**
 * Criteria for graduating from Org (3) to Cross-Org (4)
 */
export interface CrossOrgGraduationCriteria {
  /** Minimum helpful rate (0.0 - 1.0) */
  minHelpfulRate: number;
  /** Requires explicit share action */
  explicitShare: boolean;
}

/**
 * Criteria for graduating from Cross-Org (4) to Global (5)
 */
export interface GlobalGraduationCriteria {
  /** Minimum helpful rate (0.0 - 1.0) */
  minHelpfulRate: number;
  /** Whether admin approval is required */
  adminApproval: boolean;
  /** Whether to anonymize org-specific data */
  anonymization: boolean;
}

/**
 * @deprecated Use UserGraduationCriteria instead
 */
export type LocalGraduationCriteria = UserGraduationCriteria & {
  minAcceptanceRate?: number;
  maxModificationRate?: number;
  sameCompany?: boolean;
};

/**
 * @deprecated Use ProjectGraduationCriteria instead
 */
export type CompanyGraduationCriteria = ProjectGraduationCriteria & {
  minAcceptanceRate?: number;
  maxModificationRate?: number;
  sameCompany?: boolean;
  adminApproval?: boolean;
};

/**
 * @deprecated Use GlobalGraduationCriteria instead
 */
export type SharedGraduationCriteria = GlobalGraduationCriteria & {
  minCompanies?: number;
  minAcceptanceRate?: number;
  maxModificationRate?: number;
};

/**
 * CEDA-95: Default graduation criteria configuration for 6-level model
 */
export const DEFAULT_GRADUATION_CRITERIA = {
  /** Level 0 -> 1: Observation to User Pattern */
  user: {
    minObservations: 3,
    minHelpfulRate: 0.7,
    sameUser: true,
  } as UserGraduationCriteria,
  /** Level 1 -> 2: User to Project Pattern */
  project: {
    minUsers: 3,
    minHelpfulRate: 0.8,
    sameProject: true,
  } as ProjectGraduationCriteria,
  /** Level 2 -> 3: Project to Org Pattern */
  org: {
    minProjects: 3,
    minHelpfulRate: 0.85,
    sameOrg: true,
  } as OrgGraduationCriteria,
  /** Level 3 -> 4: Org to Cross-Org */
  crossOrg: {
    minHelpfulRate: 0.9,
    explicitShare: true,
  } as CrossOrgGraduationCriteria,
  /** Level 4 -> 5: Cross-Org to Global */
  global: {
    minHelpfulRate: 0.95,
    adminApproval: true,
    anonymization: true,
  } as GlobalGraduationCriteria,
  /** @deprecated Legacy aliases for backwards compatibility with graduation.service.ts */
  local: {
    minObservations: 3,
    minHelpfulRate: 0.7,
    minAcceptanceRate: 0.7,
    maxModificationRate: 0.3,
    sameUser: true,
    sameCompany: true,
  } as LocalGraduationCriteria,
  company: {
    minUsers: 3,
    minHelpfulRate: 0.8,
    minAcceptanceRate: 0.8,
    maxModificationRate: 0.2,
    sameProject: true,
    sameCompany: true,
    adminApproval: false,
  } as CompanyGraduationCriteria,
  shared: {
    minHelpfulRate: 0.95,
    minAcceptanceRate: 0.9,
    maxModificationRate: 0.1,
    minCompanies: 3,
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
