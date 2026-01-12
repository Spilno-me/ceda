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
   * CEDA-36: Pattern graduation level
   * 0 = Observation (initial)
   * 1 = Local Pattern (user-specific)
   * 2 = Company Pattern (company-wide)
   * 3 = Shared Pattern (cross-domain)
   * @default 0
   */
  level?: PatternLevel;
  /**
   * CEDA-36: Timestamp when pattern was last graduated
   */
  graduatedAt?: Date;
}

/**
 * CEDA-36: Pattern graduation levels
 */
export enum PatternLevel {
  /** Initial observation - not yet validated */
  OBSERVATION = 0,
  /** Local pattern - validated for a single user */
  LOCAL = 1,
  /** Company pattern - validated across multiple users in a company */
  COMPANY = 2,
  /** Shared pattern - validated across multiple companies, anonymized */
  SHARED = 3,
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
