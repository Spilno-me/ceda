/**
 * Spilno Domain Patterns
 *
 * These patterns are specific to trust network and community governance domain.
 * CEDA is domain-agnostic - this file demonstrates how to inject domain patterns.
 *
 * Multi-tenant Pattern Isolation (CEDA-30):
 * - Patterns have a `company` field for tenant-specific filtering
 * - Spilno patterns belong to company='spilno' (trust network domain tenant)
 *
 * CEDA-31: Company Pattern Seeds
 * - Collective Initiative: Community-driven project proposal
 * - Collective Decision: Community voting and consensus building
 * - Resource Sharing: Peer-to-peer resource sharing agreement
 * - Trust Circle: Trust relationship and reputation tracking
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * Spilno Patterns for Collective Initiative, Decision, Resource Sharing, Trust Circle
 */
export const SPILNO_PATTERNS: Pattern[] = [
  // Collective Initiative
  {
    id: 'spilno-initiative-default',
    name: 'Collective Initiative',
    category: PatternCategory.INITIATIVE,
    description: 'Community-driven project proposal',
    company: 'spilno',
    structure: {
      sections: [
        { name: 'Initiative', fieldTypes: ['text', 'text', 'select', 'text'], required: true },
        { name: 'Resources', fieldTypes: ['number', 'list', 'text'], required: true },
        { name: 'Support', fieldTypes: ['list', 'list', 'number'], required: true },
        { name: 'Outcome', fieldTypes: ['select', 'list', 'list'], required: true },
      ],
      workflows: ['propose', 'gather_support', 'fund', 'execute', 'report'],
      defaultFields: ['title', 'description', 'category', 'initiator', 'budget_needed', 'skills_needed', 'timeline', 'supporters', 'pledges', 'threshold', 'status', 'deliverables', 'impact_metrics'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'initiative', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'project', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'proposal', weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'community', weight: 0.6 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Collective Decision
  {
    id: 'spilno-governance-default',
    name: 'Collective Decision',
    category: PatternCategory.GOVERNANCE,
    description: 'Community voting and consensus building',
    company: 'spilno',
    structure: {
      sections: [
        { name: 'Proposal', fieldTypes: ['text', 'text', 'text', 'datetime'], required: true },
        { name: 'Options', fieldTypes: ['list', 'select', 'number'], required: true },
        { name: 'Votes', fieldTypes: ['number', 'list', 'list'], required: true },
        { name: 'Result', fieldTypes: ['select', 'text'], required: true },
      ],
      workflows: ['propose', 'discuss', 'vote', 'ratify', 'implement'],
      defaultFields: ['title', 'description', 'proposer', 'deadline', 'choices', 'voting_method', 'quorum', 'vote_count', 'distribution', 'comments', 'outcome', 'implementation_plan'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'decision', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'vote', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'governance', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'consensus', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Resource Sharing
  {
    id: 'spilno-sharing-default',
    name: 'Resource Sharing',
    category: PatternCategory.SHARING,
    description: 'Peer-to-peer resource sharing agreement',
    company: 'spilno',
    structure: {
      sections: [
        { name: 'Resource', fieldTypes: ['select', 'text', 'text', 'text'], required: true },
        { name: 'Terms', fieldTypes: ['text', 'text', 'text'], required: true },
        { name: 'Usage', fieldTypes: ['text', 'datetime', 'datetime', 'select'], required: true },
      ],
      workflows: ['list', 'request', 'approve', 'checkout', 'return', 'review'],
      defaultFields: ['type', 'description', 'owner', 'availability', 'duration', 'compensation', 'conditions', 'borrower', 'checkout_time', 'return_time', 'condition'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'sharing', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'resource', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'borrow', weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'lend', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Trust Circle
  {
    id: 'spilno-trust-default',
    name: 'Trust Circle',
    category: PatternCategory.TRUST,
    description: 'Trust relationship and reputation tracking',
    company: 'spilno',
    structure: {
      sections: [
        { name: 'Member', fieldTypes: ['text', 'datetime', 'text'], required: true },
        { name: 'Reputation', fieldTypes: ['number', 'number', 'list'], required: true },
        { name: 'History', fieldTypes: ['list', 'list', 'list'], required: true },
      ],
      workflows: ['invite', 'vouch', 'transact', 'rate', 'dispute'],
      defaultFields: ['user_id', 'joined_at', 'invited_by', 'trust_score', 'contributions', 'endorsements', 'transactions', 'disputes', 'resolutions'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'trust', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'reputation', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'circle', weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'member', weight: 0.6 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load Spilno patterns into a PatternLibraryService
 */
export function loadSpilnoPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(SPILNO_PATTERNS);
}
