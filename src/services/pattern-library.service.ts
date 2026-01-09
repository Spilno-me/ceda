import { Injectable } from '@nestjs/common';
import {
  Pattern,
  PatternCategory,
  PatternMatch,
  PatternStructure,
  ApplicabilityRule,
  IntentClassification,
  IntentType,
} from '../interfaces';

@Injectable()
export class PatternLibraryService {
  private patterns: Map<string, Pattern> = new Map();

  constructor() {
    this.initializeDefaultPatterns();
  }

  /**
   * Initialize with default HSE patterns
   */
  private initializeDefaultPatterns(): void {
    this.registerPattern(this.createAssessmentPattern());
    this.registerPattern(this.createIncidentPattern());
    this.registerPattern(this.createPermitPattern());
    this.registerPattern(this.createAuditPattern());
    this.registerPattern(this.createActionPattern());
  }

  /**
   * Register a pattern in the library
   */
  registerPattern(pattern: Pattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): Pattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get all patterns in a category
   */
  getPatternsByCategory(category: PatternCategory): Pattern[] {
    return Array.from(this.patterns.values()).filter(
      (p) => p.category === category,
    );
  }

  /**
   * Find best matching pattern for a given intent classification
   */
  matchPattern(classification: IntentClassification): PatternMatch | null {
    let bestMatch: PatternMatch | null = null;
    let highestScore = 0;

    for (const pattern of this.patterns.values()) {
      const { score, matchedRules } = this.evaluatePattern(
        pattern,
        classification,
      );
      if (score > highestScore) {
        highestScore = score;
        bestMatch = { pattern, score, matchedRules };
      }
    }

    return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
  }

  /**
   * Evaluate how well a pattern matches the classification
   */
  private evaluatePattern(
    pattern: Pattern,
    classification: IntentClassification,
  ): { score: number; matchedRules: string[] } {
    const matchedRules: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const rule of pattern.applicabilityRules) {
      const ruleScore = this.evaluateRule(rule, classification);
      if (ruleScore > 0) {
        matchedRules.push(rule.field);
      }
      totalScore += ruleScore * rule.weight;
      totalWeight += rule.weight;
    }

    const score = totalWeight > 0 ? totalScore / totalWeight : 0;
    return { score, matchedRules };
  }

  /**
   * Evaluate a single applicability rule
   */
  private evaluateRule(
    rule: ApplicabilityRule,
    classification: IntentClassification,
  ): number {
    const fieldValue = this.getFieldValue(rule.field, classification);
    if (fieldValue === undefined || fieldValue === null) {
      return 0;
    }

    const stringValue = String(fieldValue).toLowerCase();
    const ruleValue = rule.value.toLowerCase();

    switch (rule.operator) {
      case 'equals':
        return stringValue === ruleValue ? 1 : 0;
      case 'contains':
        return stringValue.includes(ruleValue) ? 1 : 0;
      case 'matches':
        try {
          const regex = new RegExp(ruleValue, 'i');
          return regex.test(stringValue) ? 1 : 0;
        } catch {
          return 0;
        }
      default:
        return 0;
    }
  }

  /**
   * Get field value from classification for rule evaluation
   */
  private getFieldValue(
    field: string,
    classification: IntentClassification,
  ): string | undefined {
    switch (field) {
      case 'intent':
        return classification.intent;
      case 'domain':
        return classification.domain;
      case 'confidence':
        return String(classification.confidence);
      case 'entities':
        return classification.entities.join(' ');
      default:
        return undefined;
    }
  }

  /**
   * Get the structure template for a pattern
   */
  getPatternStructure(patternId: string): PatternStructure | undefined {
    const pattern = this.patterns.get(patternId);
    return pattern?.structure;
  }

  /**
   * Get all registered patterns
   */
  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Create Safety Assessment pattern
   */
  private createAssessmentPattern(): Pattern {
    return {
      id: 'assessment-default',
      name: 'Safety Assessment',
      category: PatternCategory.ASSESSMENT,
      description: 'Standard safety assessment form',
      structure: {
        sections: [
          {
            name: 'General Information',
            fieldTypes: ['text', 'date', 'select'],
            required: true,
          },
          {
            name: 'Hazard Identification',
            fieldTypes: ['checklist', 'text'],
            required: true,
          },
          {
            name: 'Risk Evaluation',
            fieldTypes: ['matrix', 'number'],
            required: true,
          },
          {
            name: 'Control Measures',
            fieldTypes: ['text', 'checklist'],
            required: true,
          },
        ],
        workflows: ['review', 'approve'],
        defaultFields: ['assessor', 'date', 'location', 'department'],
      },
      applicabilityRules: [
        {
          field: 'intent',
          operator: 'equals',
          value: IntentType.CREATE,
          weight: 0.5,
        },
        { field: 'domain', operator: 'contains', value: 'assessment', weight: 1.0 },
        { field: 'domain', operator: 'contains', value: 'safety', weight: 0.8 },
      ],
      confidenceFactors: [],
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        successRate: 0,
      },
    };
  }

  /**
   * Create Incident Report pattern
   */
  private createIncidentPattern(): Pattern {
    return {
      id: 'incident-default',
      name: 'Incident Report',
      category: PatternCategory.INCIDENT,
      description: 'Standard incident reporting form',
      structure: {
        sections: [
          {
            name: 'Incident Details',
            fieldTypes: ['text', 'date', 'time', 'select'],
            required: true,
          },
          {
            name: 'Investigation',
            fieldTypes: ['text', 'checklist'],
            required: true,
          },
          {
            name: 'Root Cause',
            fieldTypes: ['text', 'select'],
            required: true,
          },
          {
            name: 'Corrective Actions',
            fieldTypes: ['text', 'date', 'select'],
            required: true,
          },
        ],
        workflows: ['investigate', 'review', 'close'],
        defaultFields: ['reporter', 'date', 'location', 'severity', 'type'],
      },
      applicabilityRules: [
        {
          field: 'intent',
          operator: 'equals',
          value: IntentType.CREATE,
          weight: 0.5,
        },
        { field: 'domain', operator: 'contains', value: 'incident', weight: 1.0 },
        { field: 'domain', operator: 'contains', value: 'report', weight: 0.6 },
        { field: 'domain', operator: 'contains', value: 'accident', weight: 0.8 },
      ],
      confidenceFactors: [],
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        successRate: 0,
      },
    };
  }

  /**
   * Create Work Permit pattern
   */
  private createPermitPattern(): Pattern {
    return {
      id: 'permit-default',
      name: 'Work Permit',
      category: PatternCategory.PERMIT,
      description: 'Standard work permit form',
      structure: {
        sections: [
          {
            name: 'Permit Type',
            fieldTypes: ['select', 'text'],
            required: true,
          },
          {
            name: 'Work Conditions',
            fieldTypes: ['checklist', 'text'],
            required: true,
          },
          {
            name: 'Approvals',
            fieldTypes: ['signature', 'date'],
            required: true,
          },
          {
            name: 'Duration',
            fieldTypes: ['date', 'time'],
            required: true,
          },
        ],
        workflows: ['request', 'approve', 'activate', 'close'],
        defaultFields: ['requester', 'approver', 'startDate', 'endDate', 'location'],
      },
      applicabilityRules: [
        {
          field: 'intent',
          operator: 'equals',
          value: IntentType.CREATE,
          weight: 0.5,
        },
        { field: 'domain', operator: 'contains', value: 'permit', weight: 1.0 },
        { field: 'domain', operator: 'contains', value: 'work', weight: 0.6 },
        { field: 'domain', operator: 'contains', value: 'authorization', weight: 0.7 },
      ],
      confidenceFactors: [],
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        successRate: 0,
      },
    };
  }

  /**
   * Create Safety Audit pattern
   */
  private createAuditPattern(): Pattern {
    return {
      id: 'audit-default',
      name: 'Safety Audit',
      category: PatternCategory.AUDIT,
      description: 'Standard safety audit form',
      structure: {
        sections: [
          {
            name: 'Audit Scope',
            fieldTypes: ['text', 'select', 'date'],
            required: true,
          },
          {
            name: 'Findings',
            fieldTypes: ['text', 'checklist', 'select'],
            required: true,
          },
          {
            name: 'Non-conformances',
            fieldTypes: ['text', 'select', 'number'],
            required: true,
          },
          {
            name: 'Follow-up',
            fieldTypes: ['text', 'date', 'select'],
            required: true,
          },
        ],
        workflows: ['plan', 'execute', 'report', 'follow-up'],
        defaultFields: ['auditor', 'auditDate', 'area', 'standard'],
      },
      applicabilityRules: [
        {
          field: 'intent',
          operator: 'equals',
          value: IntentType.CREATE,
          weight: 0.5,
        },
        { field: 'domain', operator: 'contains', value: 'audit', weight: 1.0 },
        { field: 'domain', operator: 'contains', value: 'inspection', weight: 0.8 },
        { field: 'domain', operator: 'contains', value: 'compliance', weight: 0.7 },
      ],
      confidenceFactors: [],
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        successRate: 0,
      },
    };
  }

  /**
   * Create Corrective Action pattern
   */
  private createActionPattern(): Pattern {
    return {
      id: 'action-default',
      name: 'Corrective Action',
      category: PatternCategory.ACTION,
      description: 'Standard corrective action form',
      structure: {
        sections: [
          {
            name: 'Action Details',
            fieldTypes: ['text', 'select'],
            required: true,
          },
          {
            name: 'Assignee',
            fieldTypes: ['select', 'text'],
            required: true,
          },
          {
            name: 'Due Date',
            fieldTypes: ['date'],
            required: true,
          },
          {
            name: 'Verification',
            fieldTypes: ['text', 'checklist', 'signature'],
            required: true,
          },
        ],
        workflows: ['assign', 'implement', 'verify', 'close'],
        defaultFields: ['actionId', 'assignee', 'dueDate', 'priority', 'status'],
      },
      applicabilityRules: [
        {
          field: 'intent',
          operator: 'equals',
          value: IntentType.CREATE,
          weight: 0.5,
        },
        { field: 'domain', operator: 'contains', value: 'action', weight: 1.0 },
        { field: 'domain', operator: 'contains', value: 'corrective', weight: 0.9 },
        { field: 'domain', operator: 'contains', value: 'remediation', weight: 0.7 },
      ],
      confidenceFactors: [],
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
        successRate: 0,
      },
    };
  }
}
