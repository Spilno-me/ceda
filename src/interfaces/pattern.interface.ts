import { ConfidenceFactor } from './prediction.interface';

export interface Pattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
  structure: PatternStructure;
  applicabilityRules: ApplicabilityRule[];
  confidenceFactors: ConfidenceFactor[];
  metadata: PatternMetadata;
  /** @deprecated Use domainAffinity for AI-native multi-tenancy */
  company?: string;
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
