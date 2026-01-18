import { ConfidenceFactor } from './prediction.interface';

/**
 * Pattern scope determines visibility and access level
 * USER is the primary doorway - patterns are always accessed through a user context
 */
export enum PatternScope {
  /** User-specific patterns - only visible to the owning user */
  USER = 'user',
  /** Project-scoped patterns - visible to all users in the project */
  PROJECT = 'project',
  /** Company-scoped patterns - visible to all users in the company */
  COMPANY = 'company',
  /** Global patterns - visible to all users (system defaults) */
  GLOBAL = 'global',
}

export interface Pattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
  structure: PatternStructure;
  applicabilityRules: ApplicabilityRule[];
  confidenceFactors: ConfidenceFactor[];
  metadata: PatternMetadata;
  /**
   * User ID - required for user-scoped patterns
   * USER is the doorway: all pattern access flows through user context
   */
  user_id?: string;
  /**
   * Pattern scope determines visibility level
   * @default PatternScope.GLOBAL for backward compatibility
   */
  scope?: PatternScope;
  /** @deprecated Use domainAffinity for AI-native multi-tenancy */
  company?: string;
  /** Project identifier for project-scoped patterns */
  project?: string;
  /** Domain identifier for pattern categorization */
  domain?: string;
  /**
   * AI-native multi-tenancy: Learned affinity vector for tenant domains
   * Patterns rank higher for tenants with similar domain embeddings
   * Updated via outcome learning (recordOutcome)
   */
  domainAffinity?: number[];
  /**
   * CEDA-32: Grounding loop confidence tracking
   * Patterns decay without grounding, boost with successful executions
   */
  confidence?: PatternConfidence;
  /**
   * CEDA-95: Pattern graduation level (6 levels)
   * 0 = Observation (raw capture)
   * 1 = User Pattern (3+ obs, 70% helpful, same user)
   * 2 = Project Pattern (3+ users, 80% helpful, same project)
   * 3 = Org Pattern (3+ projects, 85% helpful, same org)
   * 4 = Cross-Org (explicit share, 90% helpful)
   * 5 = Global (admin approved, 95% helpful)
   * @default 0
   */
  level?: PatternLevel;
  /**
   * CEDA-36: Timestamp when pattern was last graduated
   */
  graduatedAt?: Date;
  /**
   * CEDA-44: Pattern quality score (0-100)
   * Calculated based on usage frequency, acceptance rate, consistency, recency, and completeness
   * @default 50
   */
  qualityScore?: number;
}

/**
 * CEDA-95: Git-native graduation levels (6 levels)
 * Patterns graduate through levels based on usage and acceptance criteria
 */
export enum PatternLevel {
  /** Level 0: Raw herald_reflect capture - not yet validated */
  OBSERVATION = 0,
  /** Level 1: User Pattern - 3+ observations, 70% helpful, same user */
  USER = 1,
  /** Level 2: Project Pattern - 3+ users, 80% helpful, same project */
  PROJECT = 2,
  /** Level 3: Org Pattern - 3+ projects, 85% helpful, same org */
  ORG = 3,
  /** Level 4: Cross-Org - explicit share, 90% helpful */
  CROSS_ORG = 4,
  /** Level 5: Global - admin approved, 95% helpful */
  GLOBAL = 5,
}

export enum PatternCategory {
  // HSE domain categories (disrupt)
  ASSESSMENT = 'assessment',
  INCIDENT = 'incident',
  PERMIT = 'permit',
  AUDIT = 'audit',
  ACTION = 'action',
  // GoPrint domain categories (goprint)
  SESSION = 'session',
  JOB = 'job',
  MAINTENANCE = 'maintenance',
  INVENTORY = 'inventory',
  // Spilno domain categories (spilno)
  INITIATIVE = 'initiative',
  GOVERNANCE = 'governance',
  SHARING = 'sharing',
  TRUST = 'trust',
}

export interface PatternStructure {
  sections: PatternSection[];
  workflows: string[];
  defaultFields: string[];
}

export interface PatternSection {
  name: string;
  fieldTypes: string[];
  required: boolean;
}

export interface ApplicabilityRule {
  field: string;
  operator: 'equals' | 'contains' | 'matches';
  value: string;
  weight: number;
}

export interface PatternMetadata {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  successRate: number;
}

/**
 * CEDA-32: Pattern confidence for grounding loop
 * Tracks execution feedback to adjust pattern confidence over time
 */
export interface PatternConfidence {
  /** Base confidence score (0.0 - 1.0) */
  base: number;
  /** Last successful execution timestamp (null if never grounded) */
  lastGrounded: Date | null;
  /** Number of times successfully executed */
  groundingCount: number;
  /** Per-day decay rate (default: 0.01) */
  decayRate: number;
}

export interface PatternMatch {
  pattern: Pattern;
  score: number;
  matchedRules: string[];
}

/**
 * CEDA-44: Quality factors breakdown for pattern quality score calculation
 * Each factor contributes to the overall quality score with specific weights
 */
export interface QualityFactors {
  /** Usage frequency factor (0-100), weight: 30% */
  usageFrequency: number;
  /** Acceptance rate factor (0-100), weight: 30% */
  acceptanceRate: number;
  /** Consistency factor (0-100), weight: 20% */
  consistency: number;
  /** Recency factor (0-100), weight: 10% */
  recency: number;
  /** Completeness factor (0-100), weight: 10% */
  completeness: number;
}

/**
 * CEDA-44: Quality score result with breakdown
 */
export interface QualityScoreResult {
  /** Pattern ID */
  patternId: string;
  /** Overall quality score (0-100) */
  score: number;
  /** Breakdown of quality factors */
  factors: QualityFactors;
  /** Whether the pattern is flagged as low quality */
  isLowQuality: boolean;
  /** Threshold used for low quality determination */
  threshold: number;
}
