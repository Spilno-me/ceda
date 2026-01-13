/**
 * Anteater Ecosystem Patterns
 *
 * Patterns for the Anteater design system toolchain:
 * - anteater: Design system generator (tokens + AI context)
 * - salvador-mcp: MCP server for design system intelligence
 *
 * These patterns enable high-confidence predictions for:
 * - Design system scaffolding
 * - Token generation and transformation
 * - Component addition and management
 * - AI context generation (.claude/ directory)
 * - Storybook story creation
 *
 */

import {
  Pattern,
  PatternCategory,
  IntentType,
} from '../interfaces';

/**
 * Anteater Ecosystem Patterns
 */
export const ANTEATER_PATTERNS: Pattern[] = [
  // Design System Scaffold (full project generation)
  {
    id: 'anteater-scaffold',
    name: 'Design System Scaffold',
    category: 'scaffold' as PatternCategory,
    description: 'Generate a complete design system with tokens, AI context, and component infrastructure',
    company: undefined,
    structure: {
      sections: [
        { name: 'Project Setup', fieldTypes: ['text', 'select'], required: true },
        { name: 'Brand Colors', fieldTypes: ['color', 'text'], required: true },
        { name: 'Token Configuration', fieldTypes: ['select', 'checklist'], required: true },
        { name: 'AI Context', fieldTypes: ['checklist'], required: true },
        { name: 'Storybook Setup', fieldTypes: ['checklist'], required: false },
      ],
      workflows: ['configure', 'generate', 'validate', 'initialize'],
      defaultFields: ['projectName', 'primaryColor', 'secondaryColor', 'outputPath'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'scaffold', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // OKLCH Token Generation
  {
    id: 'anteater-token-gen',
    name: 'OKLCH Token Generation',
    category: 'token' as PatternCategory,
    description: 'Generate perceptually uniform color scales using OKLCH color space',
    company: undefined,
    structure: {
      sections: [
        { name: 'Base Color', fieldTypes: ['color', 'text'], required: true },
        { name: 'Scale Configuration', fieldTypes: ['select', 'number'], required: true },
        { name: 'Lightness Curve', fieldTypes: ['select', 'number'], required: true },
        { name: 'Chroma Adjustment', fieldTypes: ['number', 'select'], required: false },
        { name: 'Output Format', fieldTypes: ['select', 'checklist'], required: true },
      ],
      workflows: ['input', 'calculate', 'generate', 'export'],
      defaultFields: ['baseColor', 'steps', 'minLightness', 'maxLightness', 'outputFormat'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'oklch', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Semantic Token Mapping
  {
    id: 'anteater-token-map',
    name: 'Semantic Token Mapping',
    category: 'token' as PatternCategory,
    description: 'Map primitive tokens to semantic aliases for component usage',
    company: undefined,
    structure: {
      sections: [
        { name: 'Source Tokens', fieldTypes: ['select', 'text'], required: true },
        { name: 'Semantic Categories', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Interactive States', fieldTypes: ['checklist'], required: true },
        { name: 'Dark Mode Mapping', fieldTypes: ['select', 'checklist'], required: true },
        { name: 'Validation', fieldTypes: ['checklist'], required: true },
      ],
      workflows: ['analyze', 'map', 'validate', 'export'],
      defaultFields: ['primitiveScale', 'semanticCategory', 'interactiveStates', 'darkModeStrategy'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'semantic', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Component Addition (shadcn fetch + transform)
  {
    id: 'anteater-component-add',
    name: 'Component Addition',
    category: 'component' as PatternCategory,
    description: 'Fetch shadcn components and transform to use semantic tokens',
    company: undefined,
    structure: {
      sections: [
        { name: 'Component Selection', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Token Transformation', fieldTypes: ['checklist'], required: true },
        { name: 'Dependencies', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Output Location', fieldTypes: ['text', 'select'], required: true },
        { name: 'Post-processing', fieldTypes: ['checklist'], required: false },
      ],
      workflows: ['select', 'fetch', 'transform', 'install'],
      defaultFields: ['componentNames', 'transformRules', 'outputPath', 'dependencies'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 0.8 },
      { field: 'domain', operator: 'equals', value: 'shadcn', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Token Transformation Rules
  {
    id: 'anteater-transform',
    name: 'Token Transformation',
    category: 'token' as PatternCategory,
    description: 'Transform shadcn default tokens to semantic design system tokens',
    company: undefined,
    structure: {
      sections: [
        { name: 'Source Patterns', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Target Tokens', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Transformation Rules', fieldTypes: ['text', 'select'], required: true },
        { name: 'Validation', fieldTypes: ['checklist'], required: true },
      ],
      workflows: ['analyze', 'define', 'transform', 'verify'],
      defaultFields: ['sourcePattern', 'targetToken', 'transformRule', 'validationChecks'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.MODIFY, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'transform', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // AI Context Generation (.claude/ directory)
  {
    id: 'anteater-ai-context',
    name: 'AI Context Generation',
    category: 'scaffold' as PatternCategory,
    description: 'Generate Claude Code context with skills, hookify rules, and token constraints',
    company: undefined,
    structure: {
      sections: [
        { name: 'Skills Configuration', fieldTypes: ['checklist', 'number'], required: true },
        { name: 'Hookify Rules', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Token Constraints', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Agent Instructions', fieldTypes: ['text', 'checklist'], required: false },
      ],
      workflows: ['configure', 'generate', 'validate', 'deploy'],
      defaultFields: ['skillCategories', 'hookifyRules', 'tokenConstraints', 'agentPath'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'claude', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Storybook Story Generation
  {
    id: 'anteater-story',
    name: 'Storybook Story',
    category: 'pattern' as PatternCategory,
    description: 'Generate Storybook stories with AllStates pattern and proper controls',
    company: undefined,
    structure: {
      sections: [
        { name: 'Component Reference', fieldTypes: ['text', 'select'], required: true },
        { name: 'Story Variants', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Controls Configuration', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Documentation', fieldTypes: ['text', 'checklist'], required: false },
      ],
      workflows: ['analyze', 'generate', 'configure', 'document'],
      defaultFields: ['componentName', 'variants', 'controls', 'docsContent'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'storybook', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Hookify Rule Creation
  {
    id: 'anteater-hookify',
    name: 'Hookify Rule',
    category: 'pattern' as PatternCategory,
    description: 'Create validation rules for AI code generation (color enforcement, accessibility, etc.)',
    company: undefined,
    structure: {
      sections: [
        { name: 'Rule Definition', fieldTypes: ['text', 'select'], required: true },
        { name: 'Match Patterns', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Validation Logic', fieldTypes: ['text', 'select'], required: true },
        { name: 'Error Messages', fieldTypes: ['text'], required: true },
      ],
      workflows: ['define', 'implement', 'test', 'deploy'],
      defaultFields: ['ruleName', 'matchPattern', 'validationFn', 'errorMessage'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'hookify', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Skill Creation
  {
    id: 'anteater-skill',
    name: 'Claude Skill',
    category: 'pattern' as PatternCategory,
    description: 'Create reusable Claude Code skills for design system workflows',
    company: undefined,
    structure: {
      sections: [
        { name: 'Skill Metadata', fieldTypes: ['text', 'select'], required: true },
        { name: 'Trigger Conditions', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Workflow Steps', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Output Format', fieldTypes: ['select', 'text'], required: true },
      ],
      workflows: ['define', 'implement', 'test', 'document'],
      defaultFields: ['skillName', 'triggerKeywords', 'workflowSteps', 'outputTemplate'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'skill', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Salvador MCP Tool
  {
    id: 'salvador-mcp-tool',
    name: 'MCP Tool Definition',
    category: 'component' as PatternCategory,
    description: 'Create a new tool for the salvador-mcp server',
    company: undefined,
    structure: {
      sections: [
        { name: 'Tool Metadata', fieldTypes: ['text', 'select'], required: true },
        { name: 'Input Schema', fieldTypes: ['text', 'checklist'], required: true },
        { name: 'Implementation', fieldTypes: ['text'], required: true },
        { name: 'Output Format', fieldTypes: ['select', 'text'], required: true },
        { name: 'Tests', fieldTypes: ['checklist', 'text'], required: true },
      ],
      workflows: ['design', 'implement', 'test', 'register'],
      defaultFields: ['toolName', 'inputSchema', 'handler', 'outputSchema', 'testCases'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'mcp', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Tailwind Preset Configuration
  {
    id: 'anteater-tailwind',
    name: 'Tailwind Preset',
    category: 'token' as PatternCategory,
    description: 'Configure Tailwind CSS preset with design system tokens',
    company: undefined,
    structure: {
      sections: [
        { name: 'Color Configuration', fieldTypes: ['checklist', 'text'], required: true },
        { name: 'Spacing Scale', fieldTypes: ['select', 'number'], required: true },
        { name: 'Typography', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Utilities', fieldTypes: ['checklist'], required: false },
      ],
      workflows: ['configure', 'generate', 'validate', 'export'],
      defaultFields: ['colorTokens', 'spacingScale', 'fontFamilies', 'customUtilities'],
    },
    applicabilityRules: [
      { field: 'intent', operator: 'equals', value: IntentType.CREATE, weight: 1.0 },
      { field: 'domain', operator: 'equals', value: 'tailwind', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },

  // Design System Audit
  {
    id: 'anteater-audit',
    name: 'Design System Audit',
    category: 'review' as PatternCategory,
    description: 'Audit design system for token usage, accessibility, and consistency',
    company: undefined,
    structure: {
      sections: [
        { name: 'Scope', fieldTypes: ['checklist', 'select'], required: true },
        { name: 'Token Usage', fieldTypes: ['checklist'], required: true },
        { name: 'Accessibility', fieldTypes: ['checklist'], required: true },
        { name: 'Consistency', fieldTypes: ['checklist'], required: true },
        { name: 'Findings', fieldTypes: ['text', 'select'], required: true },
      ],
      workflows: ['scan', 'analyze', 'report', 'remediate'],
      defaultFields: ['auditScope', 'tokenChecks', 'a11yChecks', 'consistencyChecks'],
    },
    applicabilityRules: [
      { field: 'domain', operator: 'equals', value: 'audit', weight: 1.0 },
    ],
    confidenceFactors: [],
    metadata: { version: '1.0.0', createdAt: new Date(), updatedAt: new Date(), usageCount: 0, successRate: 0 },
  },
];

/**
 * Load Anteater patterns into a PatternLibraryService
 */
export function loadAnteaterPatterns(patternLibrary: { loadPatterns: (patterns: Pattern[]) => void }): void {
  patternLibrary.loadPatterns(ANTEATER_PATTERNS);
}
