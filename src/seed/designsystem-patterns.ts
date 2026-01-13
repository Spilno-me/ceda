/**
 * Design System Domain Patterns
 *
 * Patterns for AI-assisted design system development and component creation.
 * These patterns enable high-confidence predictions for MCP servers like anteater-mcp.
 *
 * Multi-tenant Pattern Isolation (CEDA-30):
 * - Patterns with company='anteater' for design system domain
 * - Can be shared globally (company=null) for general design system tasks
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * Extend PatternCategory for design system domain
 * Note: For production, add these to pattern.interface.ts
 */
export enum DesignSystemCategory {
  COMPONENT = 'component',
  TOKEN = 'token',
  PATTERN = 'pattern',
  ACCESSIBILITY = 'accessibility',
  REVIEW = 'review',
}

/**
 * Design System Patterns for Component Creation, Token Management, Accessibility, etc.
 */
export const DESIGNSYSTEM_PATTERNS: Pattern[] = [
  // UI Component Creation
  {
    id: 'ds-component-create',
    name: 'UI Component',
    category: 'component' as PatternCategory,
    description: 'Create a new UI component with variants, props, and accessibility',
    company: undefined, // Global pattern - available to all tenants
    structure: {
      sections: [
        { name: 'Component Definition', fieldTypes: ['text', 'select'], required: true },
        { name: 'Props & Variants', fieldTypes: ['text', 'checklist', 'select'], required: true },
        { name: 'Styling', fieldTypes: ['text', 'select'], required: true },
        { name: 'Accessibility', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Testing', fieldTypes: ['checklist', 'text'], required: false },
      ],
      workflows: ['design', 'implement', 'test', 'document'],
      defaultFields: ['componentName', 'variants', 'props', 'a11y', 'testIds'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'component', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Design Token Definition
  {
    id: 'ds-token-define',
    name: 'Design Token',
    category: 'token' as PatternCategory,
    description: 'Define design tokens for colors, spacing, typography',
    company: undefined,
    structure: {
      sections: [
        { name: 'Token Type', fieldTypes: ['select'], required: true },
        { name: 'Token Values', fieldTypes: ['text', 'color', 'number'], required: true },
        { name: 'Scale Generation', fieldTypes: ['select', 'number'], required: false },
        { name: 'Dark Mode Mapping', fieldTypes: ['select', 'color'], required: false },
      ],
      workflows: ['define', 'generate', 'validate', 'export'],
      defaultFields: ['tokenName', 'tokenType', 'baseValue', 'scale'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'token', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // WCAG Accessibility Check
  {
    id: 'ds-accessibility-check',
    name: 'Accessibility Audit',
    category: 'accessibility' as PatternCategory,
    description: 'WCAG accessibility validation for components and pages',
    company: undefined,
    structure: {
      sections: [
        { name: 'Target Element', fieldTypes: ['text', 'select'], required: true },
        { name: 'WCAG Level', fieldTypes: ['select'], required: true },
        { name: 'Contrast Check', fieldTypes: ['color', 'number'], required: true },
        { name: 'Keyboard Navigation', fieldTypes: ['checklist'], required: true },
        { name: 'Screen Reader', fieldTypes: ['checklist', 'text'], required: true },
      ],
      workflows: ['scan', 'validate', 'report', 'remediate'],
      defaultFields: ['targetId', 'wcagLevel', 'contrastRatio', 'ariaLabels'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'equals', value: 'accessibility', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Design Pattern Implementation
  {
    id: 'ds-pattern-implement',
    name: 'Design Pattern',
    category: 'pattern' as PatternCategory,
    description: 'Implement common UI patterns (forms, navigation, layouts)',
    company: undefined,
    structure: {
      sections: [
        { name: 'Pattern Type', fieldTypes: ['select'], required: true },
        { name: 'Components Used', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Responsive Behavior', fieldTypes: ['select', 'text'], required: true },
        { name: 'State Management', fieldTypes: ['text', 'select'], required: false },
      ],
      workflows: ['select', 'customize', 'implement', 'test'],
      defaultFields: ['patternType', 'breakpoints', 'components', 'states'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'pattern', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Component/Design Review
  {
    id: 'ds-review-component',
    name: 'Design Review',
    category: 'review' as PatternCategory,
    description: 'Review component or design for quality, consistency, and best practices',
    company: undefined,
    structure: {
      sections: [
        { name: 'Review Target', fieldTypes: ['text', 'select'], required: true },
        { name: 'Design Consistency', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Code Quality', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'UX Compliance', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Findings', fieldTypes: ['text', 'select'], required: true },
      ],
      workflows: ['analyze', 'validate', 'report', 'approve'],
      defaultFields: ['targetName', 'reviewType', 'findings', 'recommendation'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'equals', value: 'review', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // MCP Tool/Server Analysis
  {
    id: 'ds-mcp-analyze',
    name: 'MCP Server Analysis',
    category: 'review' as PatternCategory,
    description: 'Analyze MCP server structure, tools, and capabilities',
    company: undefined,
    structure: {
      sections: [
        { name: 'Server Overview', fieldTypes: ['text'], required: true },
        { name: 'Tool Inventory', fieldTypes: ['checklist', 'number'], required: true },
        { name: 'Architecture Analysis', fieldTypes: ['text', 'select'], required: true },
        { name: 'Dependencies', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Recommendations', fieldTypes: ['text', 'select'], required: false },
      ],
      workflows: ['scan', 'analyze', 'document', 'recommend'],
      defaultFields: ['serverName', 'toolCount', 'dependencies', 'coverage'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'equals', value: 'review', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load Design System patterns into a PatternLibraryService
 */
export function loadDesignSystemPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(DESIGNSYSTEM_PATTERNS);
}
