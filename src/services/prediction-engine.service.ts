import { Injectable } from '@nestjs/common';
import {
  ProcessedSignal,
  StructurePrediction,
  SectionPrediction,
  FieldPrediction,
  WorkflowPrediction,
  WorkflowStep,
  Pattern,
  PatternSection,
  PatternMatch,
  TenantContext,
} from '../interfaces';
import { PatternLibraryService } from './pattern-library.service';
import { VectorStoreService } from './vector-store.service';

/**
 * Modification target types for applying user changes
 */
type ModificationTarget =
  | 'section'
  | 'field'
  | 'workflow'
  | 'validation'
  | 'default'
  | 'order'
  | 'type';

interface ModificationIntent {
  target: ModificationTarget;
  action: 'add' | 'remove' | 'modify';
  details: Record<string, unknown>;
}

@Injectable()
export class PredictionEngineService {
  private vectorStore: VectorStoreService | null = null;

  constructor(private readonly patternLibrary: PatternLibraryService) {}

  setVectorStore(vectorStore: VectorStoreService): void {
    this.vectorStore = vectorStore;
  }

  /**
   * Generate structure prediction from processed signal
   * Uses vector similarity search if available, falls back to rule-based matching
   * @param signal - The processed signal containing intent classification
   * @param tenantContext - Optional tenant context for multi-tenant filtering
   */
  async predict(
    signal: ProcessedSignal,
    tenantContext?: TenantContext,
  ): Promise<StructurePrediction> {
    // Try vector similarity search first if available
    let patternMatch: PatternMatch | null = null;
    let usedVectorSearch = false;

    if (this.vectorStore && this.vectorStore.isAvailable() && this.vectorStore.isInitialized()) {
      const queryText = this.buildQueryText(signal);
      patternMatch = await this.vectorStore.findBestMatch(queryText, 0.3, tenantContext);
      if (patternMatch) {
        usedVectorSearch = true;
        console.log(`[PredictionEngine] Vector search matched: ${patternMatch.pattern.name} (score: ${patternMatch.score.toFixed(3)})`);
      }
    }

    // Fall back to rule-based matching if vector search didn't find a match
    if (!patternMatch) {
      patternMatch = this.patternLibrary.matchPattern(signal.intentClassification, tenantContext);
    }

    if (!patternMatch) {
      return this.createDefaultPrediction(signal);
    }

    const { pattern, score } = patternMatch;

    const sections = this.generateSections(pattern);
    const workflow = this.generateWorkflow(pattern);
    const rationale = this.buildRationale(pattern, signal, score, usedVectorSearch);
    const alternatives = await this.getAlternatives(signal, pattern.id, 2, tenantContext);

    return {
      moduleType: pattern.category,
      sections,
      confidence: score,
      rationale,
      alternatives,
    };
  }

  /**
   * Build query text from processed signal for vector search
   */
  private buildQueryText(signal: ProcessedSignal): string {
    const parts: string[] = [];
    
    if (signal.intentClassification.domain) {
      parts.push(signal.intentClassification.domain);
    }
    
    if (signal.intentClassification.entities.length > 0) {
      parts.push(...signal.intentClassification.entities);
    }
    
    parts.push(signal.intentClassification.intent);
    
    return parts.join(' ');
  }

  /**
   * Apply user modification to existing prediction
   */
  async applyModification(
    prediction: StructurePrediction,
    modification: string,
  ): Promise<StructurePrediction> {
    const intent = this.parseModification(modification);
    const updatedPrediction = this.applyIntent(prediction, intent);

    // Reduce confidence slightly after modification
    return {
      ...updatedPrediction,
      confidence: Math.max(0.5, prediction.confidence * 0.95),
      rationale: `${prediction.rationale} Modified: ${modification}`,
    };
  }

  /**
   * Generate workflow prediction from pattern
   */
  generateWorkflow(pattern: Pattern): WorkflowPrediction {
    const steps: WorkflowStep[] = pattern.structure.workflows.map(
      (workflowName, index) => ({
        name: this.capitalizeFirst(workflowName),
        type: this.mapWorkflowType(workflowName),
        assignee: this.getDefaultAssignee(workflowName),
        conditions: index > 0 ? [`previous_step_complete`] : [],
      }),
    );

    return {
      workflowType: pattern.category,
      steps,
      confidence: 0.85,
    };
  }

  /**
   * Generate sections from pattern structure
   */
  private generateSections(pattern: Pattern): SectionPrediction[] {
    return pattern.structure.sections.map((section, index) =>
      this.convertPatternSection(section, index, pattern.structure.defaultFields),
    );
  }

  /**
   * Convert pattern section to section prediction
   */
  private convertPatternSection(
    section: PatternSection,
    order: number,
    defaultFields: string[],
  ): SectionPrediction {
    const fields = this.generateFieldsForSection(section, defaultFields, order);

    return {
      name: section.name,
      fields,
      order,
    };
  }

  /**
   * Generate fields for a section based on field types
   */
  private generateFieldsForSection(
    section: PatternSection,
    defaultFields: string[],
    sectionIndex: number,
  ): FieldPrediction[] {
    const fields: FieldPrediction[] = [];

    // Add default fields for first section
    if (sectionIndex === 0) {
      for (const fieldName of defaultFields) {
        fields.push({
          name: this.formatFieldName(fieldName),
          type: this.inferFieldType(fieldName),
          required: true,
        });
      }
    }

    // Add section-specific fields based on field types
    for (const fieldType of section.fieldTypes) {
      fields.push({
        name: `${this.formatSectionFieldName(section.name)} ${this.capitalizeFirst(fieldType)}`,
        type: fieldType,
        required: section.required,
      });
    }

    return fields;
  }

  /**
   * Create default prediction when no pattern matches
   */
  private createDefaultPrediction(signal: ProcessedSignal): StructurePrediction {
    const domain = signal.intentClassification.domain || 'general';

    return {
      moduleType: 'custom',
      sections: [
        {
          name: 'General Information',
          fields: [
            { name: 'Title', type: 'text', required: true },
            { name: 'Description', type: 'textarea', required: false },
            { name: 'Date', type: 'date', required: true },
          ],
          order: 0,
        },
      ],
      confidence: 0.3,
      rationale: `No specific pattern matched for domain "${domain}". Using generic structure.`,
      alternatives: [],
    };
  }

  /**
   * Build rationale explanation for the prediction
   */
  private buildRationale(
    pattern: Pattern,
    signal: ProcessedSignal,
    score: number,
    usedVectorSearch: boolean = false,
  ): string {
    const domain = signal.intentClassification.domain || 'unknown';
    const confidence = Math.round(score * 100);
    const matchMethod = usedVectorSearch ? 'vector similarity search' : 'rule-based matching';

    return `Matched "${pattern.name}" pattern (${confidence}% confidence) using ${matchMethod} based on domain "${domain}". ` +
      `Pattern includes ${pattern.structure.sections.length} sections and ${pattern.structure.workflows.length} workflow stages.`;
  }

  /**
   * Get alternative predictions excluding the primary pattern
   */
  private async getAlternatives(
    signal: ProcessedSignal,
    excludePatternId: string,
    limit: number,
    tenantContext?: TenantContext,
  ): Promise<StructurePrediction[]> {
    const allPatterns = this.patternLibrary.getAllPatterns();
    const alternatives: StructurePrediction[] = [];

    for (const pattern of allPatterns) {
      if (pattern.id === excludePatternId) continue;
      if (alternatives.length >= limit) break;

      const match = this.patternLibrary.matchPattern(signal.intentClassification, tenantContext);
      if (match && match.pattern.id === pattern.id && match.score > 0.2) {
        alternatives.push({
          moduleType: pattern.category,
          sections: this.generateSections(pattern),
          confidence: match.score * 0.8, // Reduce confidence for alternatives
          rationale: `Alternative: ${pattern.name}`,
          alternatives: [],
        });
      }
    }

    return alternatives;
  }

  /**
   * Parse user modification into structured intent
   */
  private parseModification(modification: string): ModificationIntent {
    const lowerMod = modification.toLowerCase();

    // Detect target
    let target: ModificationTarget = 'field';
    if (lowerMod.includes('section')) target = 'section';
    else if (lowerMod.includes('workflow') || lowerMod.includes('step')) target = 'workflow';
    else if (lowerMod.includes('validation') || lowerMod.includes('required')) target = 'validation';
    else if (lowerMod.includes('order') || lowerMod.includes('position')) target = 'order';
    else if (lowerMod.includes('type')) target = 'type';

    // Detect action
    let action: 'add' | 'remove' | 'modify' = 'modify';
    if (lowerMod.includes('add') || lowerMod.includes('include') || lowerMod.includes('create')) {
      action = 'add';
    } else if (lowerMod.includes('remove') || lowerMod.includes('delete') || lowerMod.includes('exclude')) {
      action = 'remove';
    }

    return {
      target,
      action,
      details: { originalRequest: modification },
    };
  }

  /**
   * Apply modification intent to prediction
   */
  private applyIntent(
    prediction: StructurePrediction,
    intent: ModificationIntent,
  ): StructurePrediction {
    const updated = { ...prediction, sections: [...prediction.sections] };

    switch (intent.target) {
      case 'section':
        if (intent.action === 'add') {
          updated.sections.push({
            name: 'Custom Section',
            fields: [],
            order: updated.sections.length,
          });
        }
        break;

      case 'field':
        if (intent.action === 'add' && updated.sections.length > 0) {
          const lastSection = updated.sections[updated.sections.length - 1];
          updated.sections[updated.sections.length - 1] = {
            ...lastSection,
            fields: [
              ...lastSection.fields,
              { name: 'Custom Field', type: 'text', required: false },
            ],
          };
        }
        break;

      default:
        // Other modifications handled similarly
        break;
    }

    return updated;
  }

  /**
   * Map workflow name to workflow type
   */
  private mapWorkflowType(workflowName: string): string {
    const typeMap: Record<string, string> = {
      review: 'approval',
      approve: 'approval',
      investigate: 'investigation',
      close: 'completion',
      assign: 'assignment',
      implement: 'action',
      verify: 'verification',
      plan: 'planning',
      execute: 'execution',
      report: 'reporting',
      request: 'request',
      activate: 'activation',
    };

    return typeMap[workflowName.toLowerCase()] || 'task';
  }

  /**
   * Get default assignee for workflow step
   */
  private getDefaultAssignee(workflowName: string): string {
    const assigneeMap: Record<string, string> = {
      review: 'reviewer',
      approve: 'manager',
      investigate: 'investigator',
      close: 'owner',
      assign: 'manager',
      implement: 'assignee',
      verify: 'verifier',
    };

    return assigneeMap[workflowName.toLowerCase()] || 'owner';
  }

  /**
   * Infer field type from field name
   */
  private inferFieldType(fieldName: string): string {
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('date')) return 'date';
    if (lowerName.includes('time')) return 'time';
    if (lowerName.includes('email')) return 'email';
    if (lowerName.includes('phone')) return 'phone';
    if (lowerName.includes('number') || lowerName.includes('count')) return 'number';
    if (lowerName.includes('description') || lowerName.includes('comment')) return 'textarea';
    if (lowerName.includes('status') || lowerName.includes('type') || lowerName.includes('category')) return 'select';

    return 'text';
  }

  /**
   * Format field name for display
   */
  private formatFieldName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Format section field name
   */
  private formatSectionFieldName(sectionName: string): string {
    return sectionName.split(' ')[0];
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
