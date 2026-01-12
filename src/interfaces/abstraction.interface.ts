/**
 * CEDA-37: Cross-Domain Learning Interfaces
 *
 * Defines types for pattern abstraction and cross-domain learning.
 * Enables patterns learned in one domain to benefit other domains
 * through anonymization and abstraction.
 */

/**
 * Phase in an abstracted workflow pattern
 */
export interface Phase {
  name: string;
  order: number;
  description?: string;
}

/**
 * Transition between phases in an abstracted pattern
 */
export interface Transition {
  from: string;
  to: string;
  trigger?: string;
  condition?: string;
}

/**
 * Invariant constraint that must hold in an abstracted pattern
 */
export interface Invariant {
  name: string;
  description: string;
  expression?: string;
}

/**
 * Core structure of an abstracted pattern (domain-agnostic)
 */
export interface AbstractStructure {
  phases: Phase[];
  transitions: Transition[];
  invariants: Invariant[];
}

/**
 * Mapping from abstract terms to domain-specific concrete terms
 */
export interface DomainInstance {
  domain: string;
  patternId: string;
  mapping: Record<string, string>;
}

/**
 * Abstracted pattern that can be applied across domains
 */
export interface AbstractPattern {
  id: string;
  name: string;
  structure: AbstractStructure;
  instances: DomainInstance[];
  observationCount: number;
  domains: string[];
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Evidence supporting a cross-domain insight
 */
export interface InsightEvidence {
  patternId: string;
  domain: string;
  successRate: number;
}

/**
 * Cross-domain insight derived from abstracted patterns
 */
export interface CrossDomainInsight {
  id: string;
  abstraction: AbstractPattern;
  insight: string;
  applicableDomains: string[];
  evidence: InsightEvidence[];
  requiresApproval: boolean;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
}

/**
 * Request to apply an abstraction to a new domain
 */
export interface ApplyAbstractionRequest {
  abstractionId: string;
  domain: string;
  mapping: Record<string, string>;
  adminUserId?: string;
}

/**
 * Response from applying an abstraction
 */
export interface ApplyAbstractionResponse {
  success: boolean;
  abstractionId: string;
  domain: string;
  instanceCreated: boolean;
  message?: string;
}

/**
 * Suggestion for an abstraction that could apply to a pattern
 */
export interface AbstractionSuggestion {
  abstraction: AbstractPattern;
  score: number;
  matchedStructure: string[];
  suggestedMapping: Record<string, string>;
}

/**
 * Abstraction rules for entity mapping
 */
export interface EntityAbstractionRule {
  concrete: string;
  abstract: string;
  domain?: string;
}

/**
 * Abstraction rules for field mapping
 */
export interface FieldAbstractionRule {
  concrete: string;
  abstract: string;
  domain?: string;
}

/**
 * Abstraction rules for state mapping
 */
export interface StateAbstractionRule {
  concrete: string;
  abstract: string;
  domain?: string;
}

/**
 * Complete abstraction rules configuration
 */
export interface AbstractionRules {
  entities: EntityAbstractionRule[];
  fields: FieldAbstractionRule[];
  states: StateAbstractionRule[];
}

/**
 * Default abstraction rules for cross-domain learning
 */
export const DEFAULT_ABSTRACTION_RULES: AbstractionRules = {
  entities: [
    { concrete: 'Kiosk', abstract: 'Entity', domain: 'kiosk' },
    { concrete: 'HSE Module', abstract: 'Entity', domain: 'hse' },
    { concrete: 'Print Job', abstract: 'Operation', domain: 'kiosk' },
    { concrete: 'Inspection', abstract: 'Operation', domain: 'hse' },
    { concrete: 'Assessment', abstract: 'Operation', domain: 'hse' },
    { concrete: 'Permit', abstract: 'Operation', domain: 'hse' },
    { concrete: 'Audit', abstract: 'Operation', domain: 'hse' },
    { concrete: 'Session', abstract: 'Operation', domain: 'kiosk' },
    { concrete: 'Maintenance', abstract: 'Operation', domain: 'kiosk' },
    { concrete: 'Initiative', abstract: 'Operation', domain: 'spilno' },
  ],
  fields: [
    { concrete: 'kioskId', abstract: 'entityId', domain: 'kiosk' },
    { concrete: 'printJobId', abstract: 'operationId', domain: 'kiosk' },
    { concrete: 'sessionId', abstract: 'operationId', domain: 'kiosk' },
    { concrete: 'moduleId', abstract: 'entityId', domain: 'hse' },
    { concrete: 'inspectionId', abstract: 'operationId', domain: 'hse' },
    { concrete: 'assessmentId', abstract: 'operationId', domain: 'hse' },
    { concrete: 'pages', abstract: 'units', domain: 'kiosk' },
    { concrete: 'hazards', abstract: 'items', domain: 'hse' },
    { concrete: 'findings', abstract: 'items', domain: 'hse' },
    { concrete: 'copies', abstract: 'quantity', domain: 'kiosk' },
    { concrete: 'participants', abstract: 'quantity', domain: 'hse' },
  ],
  states: [
    { concrete: 'printing', abstract: 'processing' },
    { concrete: 'inspecting', abstract: 'processing' },
    { concrete: 'assessing', abstract: 'processing' },
    { concrete: 'paused', abstract: 'suspended' },
    { concrete: 'on_hold', abstract: 'suspended' },
    { concrete: 'completed', abstract: 'done' },
    { concrete: 'finished', abstract: 'done' },
    { concrete: 'approved', abstract: 'done' },
    { concrete: 'failed', abstract: 'error' },
    { concrete: 'rejected', abstract: 'error' },
    { concrete: 'cancelled', abstract: 'error' },
    { concrete: 'draft', abstract: 'pending' },
    { concrete: 'queued', abstract: 'pending' },
    { concrete: 'scheduled', abstract: 'pending' },
  ],
};

/**
 * Safety settings for cross-domain learning
 */
export interface CrossDomainSafetySettings {
  requireAdminApproval: boolean;
  allowedDomains: string[];
  disabledDomains: string[];
  auditEnabled: boolean;
}

/**
 * Default safety settings
 */
export const DEFAULT_SAFETY_SETTINGS: CrossDomainSafetySettings = {
  requireAdminApproval: true,
  allowedDomains: ['*'],
  disabledDomains: [],
  auditEnabled: true,
};

/**
 * Audit entry for cross-domain learning actions
 */
export interface CrossDomainAuditEntry {
  id: string;
  action: 'abstraction_created' | 'abstraction_applied' | 'insight_generated' | 'insight_approved';
  abstractionId?: string;
  insightId?: string;
  sourceDomains: string[];
  targetDomain?: string;
  userId?: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}
