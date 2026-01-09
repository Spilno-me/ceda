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
