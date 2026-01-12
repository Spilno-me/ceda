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
}

export enum PatternCategory {
  ASSESSMENT = 'assessment',
  INCIDENT = 'incident',
  PERMIT = 'permit',
  AUDIT = 'audit',
  ACTION = 'action',
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

export interface PatternMatch {
  pattern: Pattern;
  score: number;
  matchedRules: string[];
}
