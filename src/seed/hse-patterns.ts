/**
 * HSE Domain Patterns
 *
 * These patterns are specific to Health, Safety, and Environment domain.
 * CEDA is domain-agnostic - this file demonstrates how to inject domain patterns.
 *
 * For other domains, create similar files:
 * - hr-patterns.ts (HR domain)
 * - finance-patterns.ts (Finance domain)
 * - etc.
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * HSE Patterns for Safety Assessment, Incident Reporting, Permits, Audits, Actions
 */
export const HSE_PATTERNS: Pattern[] = [
  // Safety Assessment
  {
    id: 'hse-assessment-default',
    name: 'Safety Assessment',
    category: PatternCategory.ASSESSMENT,
    description: 'Standard safety assessment form for HSE domain',
    structure: {
      sections: [
        { name: 'General Information', fieldTypes: ['text', 'date', 'select'], required: true },
        { name: 'Hazard Identification', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Risk Evaluation', fieldTypes: ['matrix', 'number'], required: true },
        { name: 'Control Measures', fieldTypes: ['text', 'checklist'], required: true },
      ],
      workflows: ['review', 'approve'],
      defaultFields: ['assessor', 'date', 'location', 'department'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'assessment', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'safety', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Incident Report
  {
    id: 'hse-incident-default',
    name: 'Incident Report',
    category: PatternCategory.INCIDENT,
    description: 'Standard incident reporting form for HSE domain',
    structure: {
      sections: [
        { name: 'Incident Details', fieldTypes: ['text', 'date', 'time', 'select'], required: true },
        { name: 'Investigation', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Root Cause', fieldTypes: ['text', 'select'], required: true },
        { name: 'Corrective Actions', fieldTypes: ['text', 'date', 'select'], required: true },
      ],
      workflows: ['investigate', 'review', 'close'],
      defaultFields: ['reporter', 'date', 'location', 'severity', 'type'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'incident', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'report', weight: 0.6 },
      { field: 'domain', operator: 'contains', value: 'accident', weight: 0.8 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Work Permit
  {
    id: 'hse-permit-default',
    name: 'Work Permit',
    category: PatternCategory.PERMIT,
    description: 'Standard work permit form for HSE domain',
    structure: {
      sections: [
        { name: 'Permit Type', fieldTypes: ['select', 'text'], required: true },
        { name: 'Work Conditions', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Approvals', fieldTypes: ['signature', 'date'], required: true },
        { name: 'Duration', fieldTypes: ['date', 'time'], required: true },
      ],
      workflows: ['request', 'approve', 'activate', 'close'],
      defaultFields: ['requester', 'approver', 'startDate', 'endDate', 'location'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'permit', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'work', weight: 0.6 },
      { field: 'domain', operator: 'contains', value: 'authorization', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Safety Audit
  {
    id: 'hse-audit-default',
    name: 'Safety Audit',
    category: PatternCategory.AUDIT,
    description: 'Standard safety audit form for HSE domain',
    structure: {
      sections: [
        { name: 'Audit Scope', fieldTypes: ['text', 'select', 'date'], required: true },
        { name: 'Findings', fieldTypes: ['text', 'checklist', 'select'], required: true },
        { name: 'Non-conformances', fieldTypes: ['text', 'select', 'number'], required: true },
        { name: 'Follow-up', fieldTypes: ['text', 'date', 'select'], required: true },
      ],
      workflows: ['plan', 'execute', 'report', 'follow-up'],
      defaultFields: ['auditor', 'auditDate', 'area', 'standard'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'audit', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'inspection', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'compliance', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Corrective Action
  {
    id: 'hse-action-default',
    name: 'Corrective Action',
    category: PatternCategory.ACTION,
    description: 'Standard corrective action form for HSE domain',
    structure: {
      sections: [
        { name: 'Action Details', fieldTypes: ['text', 'select'], required: true },
        { name: 'Assignee', fieldTypes: ['select', 'text'], required: true },
        { name: 'Due Date', fieldTypes: ['date'], required: true },
        { name: 'Verification', fieldTypes: ['text', 'checklist', 'signature'], required: true },
      ],
      workflows: ['assign', 'implement', 'verify', 'close'],
      defaultFields: ['actionId', 'assignee', 'dueDate', 'priority', 'status'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'action', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'corrective', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'remediation', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load HSE patterns into a PatternLibraryService
 */
export function loadHSEPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(HSE_PATTERNS);
}
