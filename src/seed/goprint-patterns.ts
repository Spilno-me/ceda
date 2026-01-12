/**
 * GoPrint Domain Patterns
 *
 * These patterns are specific to print kiosk operations domain.
 * CEDA is domain-agnostic - this file demonstrates how to inject domain patterns.
 *
 * Multi-tenant Pattern Isolation (CEDA-30):
 * - Patterns have a `company` field for tenant-specific filtering
 * - GoPrint patterns belong to company='goprint' (print kiosk domain tenant)
 *
 * CEDA-31: Company Pattern Seeds
 * - Kiosk Session: Print kiosk user session tracking
 * - Print Job: Individual print job within a session
 * - Kiosk Maintenance: Kiosk maintenance and service records
 * - Consumables Inventory: Paper, toner, and supplies tracking
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * GoPrint Patterns for Kiosk Session, Print Job, Maintenance, Inventory
 */
export const GOPRINT_PATTERNS: Pattern[] = [
  // Kiosk Session
  {
    id: 'goprint-session-default',
    name: 'Kiosk Session',
    category: PatternCategory.SESSION,
    description: 'Print kiosk user session tracking',
    company: 'goprint',
    structure: {
      sections: [
        { name: 'Session Info', fieldTypes: ['text', 'text', 'datetime', 'datetime'], required: true },
        { name: 'User', fieldTypes: ['select', 'select', 'number'], required: true },
        { name: 'Documents', fieldTypes: ['list', 'number', 'select'], required: true },
        { name: 'Payment', fieldTypes: ['number', 'select', 'text', 'select'], required: true },
      ],
      workflows: ['start', 'print', 'pay', 'complete'],
      defaultFields: ['session_id', 'kiosk_id', 'start_time', 'end_time', 'user_type', 'payment_method', 'loyalty_points'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'session', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'kiosk', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'print', weight: 0.6 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Print Job
  {
    id: 'goprint-job-default',
    name: 'Print Job',
    category: PatternCategory.JOB,
    description: 'Individual print job within a session',
    company: 'goprint',
    structure: {
      sections: [
        { name: 'Job Details', fieldTypes: ['text', 'text', 'number', 'number', 'select'], required: true },
        { name: 'Settings', fieldTypes: ['select', 'select', 'boolean', 'select'], required: true },
        { name: 'Status', fieldTypes: ['datetime', 'datetime', 'datetime', 'select'], required: true },
      ],
      workflows: ['queue', 'process', 'complete', 'fail'],
      defaultFields: ['job_id', 'filename', 'pages', 'copies', 'color_mode', 'paper_size', 'orientation', 'duplex', 'quality', 'status'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'job', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'print', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'document', weight: 0.6 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Kiosk Maintenance
  {
    id: 'goprint-maintenance-default',
    name: 'Kiosk Maintenance',
    category: PatternCategory.MAINTENANCE,
    description: 'Kiosk maintenance and service records',
    company: 'goprint',
    structure: {
      sections: [
        { name: 'Kiosk', fieldTypes: ['text', 'text', 'text', 'text'], required: true },
        { name: 'Issue', fieldTypes: ['select', 'text', 'select', 'text'], required: true },
        { name: 'Resolution', fieldTypes: ['text', 'text', 'list', 'datetime'], required: true },
      ],
      workflows: ['report', 'assign', 'resolve', 'verify'],
      defaultFields: ['kiosk_id', 'location', 'model', 'serial', 'issue_type', 'description', 'severity', 'technician', 'action_taken'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'maintenance', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'kiosk', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'service', weight: 0.7 },
      { field: 'domain', operator: 'contains', value: 'repair', weight: 0.6 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Consumables Inventory
  {
    id: 'goprint-inventory-default',
    name: 'Consumables Inventory',
    category: PatternCategory.INVENTORY,
    description: 'Paper, toner, and supplies tracking',
    company: 'goprint',
    structure: {
      sections: [
        { name: 'Item', fieldTypes: ['select', 'text', 'text'], required: true },
        { name: 'Stock', fieldTypes: ['number', 'text', 'number', 'datetime'], required: true },
        { name: 'Usage', fieldTypes: ['number', 'datetime'], required: true },
      ],
      workflows: ['check', 'reorder', 'receive', 'deploy'],
      defaultFields: ['item_type', 'sku', 'description', 'quantity', 'location', 'reorder_point', 'last_restock', 'daily_consumption'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.5 },
      { field: 'domain', operator: 'contains', value: 'inventory', weight: 1.0 },
      { field: 'domain', operator: 'contains', value: 'consumables', weight: 0.9 },
      { field: 'domain', operator: 'contains', value: 'supplies', weight: 0.8 },
      { field: 'domain', operator: 'contains', value: 'stock', weight: 0.7 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load GoPrint patterns into a PatternLibraryService
 */
export function loadGoPrintPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(GOPRINT_PATTERNS);
}
