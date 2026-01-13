/**
 * Methodology Patterns (Cross-Domain)
 *
 * These patterns emerged from the Five Hats AI Consilium (2026-01-13):
 * - ChatGPT: Cross-domain synthesis
 * - Grok: Red team critique
 * - Gemini: Technical review
 * - Claude: Meta-reflection
 *
 * AI-Native Pattern Emergence:
 * - Patterns not pre-seeded, emerged from structured roleplay
 * - Human superconductor validated and bridged perspectives
 * - company=null means shared/global (available to all tenants)
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * Methodology Patterns - Shared across all domains
 */
export const METHODOLOGY_PATTERNS: Pattern[] = [
  // === ChatGPT Patterns ===
  {
    id: 'methodology-working-reference-first',
    name: 'Working Reference First',
    category: PatternCategory.ASSESSMENT, // methodology applies to assessments
    description: 'Before building or fixing anything, locate and review an existing, working example of the same feature or flow.',
    company: undefined, // Shared across all tenants
    structure: {
      sections: [
        { name: 'Reference Identification', fieldTypes: ['text', 'select'], required: true },
        { name: 'Reference Analysis', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Adaptation Plan', fieldTypes: ['text'], required: false },
      ],
      workflows: ['identify', 'analyze', 'adapt'],
      defaultFields: ['referenceSource', 'relevanceScore', 'adaptationNotes'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'implement', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'build', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'fix', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-early-architecture-question',
    name: 'Early Architecture Question',
    category: PatternCategory.ASSESSMENT,
    description: 'Kick off any non-trivial change with a targeted question about existing system responsibilities, boundaries, and services.',
    company: undefined,
    structure: {
      sections: [
        { name: 'System Boundary', fieldTypes: ['text', 'select'], required: true },
        { name: 'Service Ownership', fieldTypes: ['text'], required: true },
        { name: 'Integration Points', fieldTypes: ['checklist'], required: true },
      ],
      workflows: ['question', 'clarify', 'document'],
      defaultFields: ['serviceOwner', 'boundaries', 'dependencies'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'architecture', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'service', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'api', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-root-cause-analysis',
    name: 'Root-Cause Analysis Session',
    category: PatternCategory.INCIDENT,
    description: 'Systematically trace a symptom through each layer of your stack (UI → business logic → service → data) until you identify the true failure point.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Symptom Description', fieldTypes: ['text'], required: true },
        { name: 'Layer Trace', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Root Cause', fieldTypes: ['text', 'select'], required: true },
        { name: 'Resolution', fieldTypes: ['text'], required: true },
      ],
      workflows: ['trace', 'identify', 'resolve', 'verify'],
      defaultFields: ['symptom', 'layers', 'rootCause', 'resolution'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'debug', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'fix', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'bug', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'error', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-data-source-verification',
    name: 'Data Source Verification',
    category: PatternCategory.ASSESSMENT,
    description: 'Validate data feed reliability (completeness, timeliness, format) before committing to it as the source of truth.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Data Sources', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Reliability Assessment', fieldTypes: ['number', 'text'], required: true },
        { name: 'Decision', fieldTypes: ['select', 'text'], required: true },
      ],
      workflows: ['identify', 'compare', 'validate', 'decide'],
      defaultFields: ['sources', 'reliability', 'chosenSource'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'data', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'source', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'api', weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'feed', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-service-routing-documentation',
    name: 'Service-Routing Documentation',
    category: PatternCategory.ASSESSMENT,
    description: 'Maintain a living map of features → APIs → services → data stores so contributors can orient themselves instantly.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Feature Map', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Service Dependencies', fieldTypes: ['text'], required: true },
        { name: 'Data Flow', fieldTypes: ['text'], required: true },
      ],
      workflows: ['map', 'document', 'update'],
      defaultFields: ['features', 'services', 'dataStores'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'onboarding', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'documentation', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'service', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // === Gemini Patterns ===
  {
    id: 'methodology-api-endpoint-validation',
    name: 'API Endpoint Validation',
    category: PatternCategory.ASSESSMENT,
    description: 'Explicitly validate API endpoints, request/response schemas, and routing rules before service implementation.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Endpoint Identification', fieldTypes: ['text'], required: true },
        { name: 'Schema Validation', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Routing Rules', fieldTypes: ['text'], required: true },
      ],
      workflows: ['identify', 'validate', 'document'],
      defaultFields: ['endpoint', 'schema', 'routingRules'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'api', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'endpoint', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'service', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-reference-implementation-audit',
    name: 'Reference Implementation Audit',
    category: PatternCategory.AUDIT,
    description: 'Identify and examine existing, functional implementations of similar features before starting development.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Similar Features', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Implementation Analysis', fieldTypes: ['text'], required: true },
        { name: 'Reuse Assessment', fieldTypes: ['select', 'text'], required: true },
      ],
      workflows: ['search', 'analyze', 'assess'],
      defaultFields: ['references', 'analysis', 'reuseDecision'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'implement', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'feature', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-layered-debugging',
    name: 'Layered Debugging (Bottom-Up)',
    category: PatternCategory.INCIDENT,
    description: 'Debug from the lowest level (data source) upwards through the service layers to isolate the root cause.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Data Layer Check', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Service Layer Check', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'UI Layer Check', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Root Cause', fieldTypes: ['text'], required: true },
      ],
      workflows: ['data-check', 'service-check', 'ui-check', 'identify'],
      defaultFields: ['dataStatus', 'serviceStatus', 'uiStatus', 'rootCause'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'debug', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'error', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'unexpected', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-workflow-comprehension',
    name: 'Workflow Comprehension',
    category: PatternCategory.ASSESSMENT,
    description: 'Fully understand the end-to-end workflow before implementing changes. This includes data flow, service interactions, and user interactions.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Data Flow', fieldTypes: ['text'], required: true },
        { name: 'Service Interactions', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'User Journey', fieldTypes: ['text'], required: true },
      ],
      workflows: ['map', 'trace', 'document'],
      defaultFields: ['dataFlow', 'services', 'userJourney'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.MODIFY, weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'workflow', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'modify', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'change', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // === Grok Meta-Patterns (Pattern Governance) ===
  {
    id: 'methodology-pattern-validation',
    name: 'Pattern Validation Protocol',
    category: PatternCategory.AUDIT,
    description: 'Define measurable outcomes and a review process for pattern efficacy before promoting patterns across domains.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Success Metrics', fieldTypes: ['text', 'number'], required: true },
        { name: 'Validation Criteria', fieldTypes: ['checklist'], required: true },
        { name: 'Domain Adaptation', fieldTypes: ['text'], required: true },
      ],
      workflows: ['define-metrics', 'validate', 'adapt'],
      defaultFields: ['metrics', 'criteria', 'adaptations'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'pattern', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'validate', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'governance', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-domain-adaptation-checklist',
    name: 'Domain Adaptation Checklist',
    category: PatternCategory.ASSESSMENT,
    description: 'Include a domain-specific adaptation checklist before promoting patterns from one domain to "shared" status.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Source Domain', fieldTypes: ['select'], required: true },
        { name: 'Target Domain', fieldTypes: ['select'], required: true },
        { name: 'Adaptation Checklist', fieldTypes: ['checklist'], required: true },
        { name: 'Contraindications', fieldTypes: ['text'], required: false },
      ],
      workflows: ['assess', 'adapt', 'validate'],
      defaultFields: ['sourceDomain', 'targetDomain', 'adaptations', 'warnings'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'transfer', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'cross-domain', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'adapt', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
  {
    id: 'methodology-stress-test-protocol',
    name: 'Stress Test Protocol',
    category: PatternCategory.AUDIT,
    description: 'Define stress tests for patterns before production use: no-reference scenarios, regulatory conflicts, high-pressure environments.',
    company: undefined,
    structure: {
      sections: [
        { name: 'Test Scenarios', fieldTypes: ['checklist'], required: true },
        { name: 'Expected Failures', fieldTypes: ['text'], required: true },
        { name: 'Mitigation Plan', fieldTypes: ['text'], required: true },
      ],
      workflows: ['define', 'execute', 'document'],
      defaultFields: ['scenarios', 'expectedFailures', 'mitigations'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'contains', value: 'stress', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'test', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'edge-case', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load methodology patterns into a PatternLibraryService
 */
export function loadMethodologyPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(METHODOLOGY_PATTERNS);
}
