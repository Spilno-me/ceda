import { Injectable } from '@nestjs/common';
import {
  AutoFix,
  AutoFixResult,
  ValidationError,
  StructurePrediction,
  SectionPrediction,
  FieldPrediction,
} from '../interfaces';
import { ValidationErrorCode } from './validation.service';
import { randomUUID } from 'crypto';

/**
 * Safe fix types that can be auto-applied without user confirmation
 */
export const SAFE_FIX_TYPES = [
  ValidationErrorCode.MISSING_REQUIRED_FIELDS,
  ValidationErrorCode.DUPLICATE_FIELD_NAME,
  ValidationErrorCode.DUPLICATE_SECTION_NAME,
  ValidationErrorCode.MISSING_SECTIONS,
  ValidationErrorCode.MISSING_FIELD_TYPE,
  ValidationErrorCode.INVALID_FIELD_TYPE,
] as const;

/**
 * Unsafe fix types that require user confirmation
 */
export const UNSAFE_FIX_TYPES = [
  'ORPHAN_REFERENCE',
  'CONFLICTING_TYPES',
  'SCHEMA_MISMATCH',
] as const;

/**
 * Required fields by module type for auto-fix
 */
const REQUIRED_FIELDS_BY_TYPE: Record<string, Array<{ name: string; type: string }>> = {
  assessment: [
    { name: 'Assessor', type: 'user' },
    { name: 'Date', type: 'date' },
    { name: 'Location', type: 'location' },
  ],
  incident: [
    { name: 'Reporter', type: 'user' },
    { name: 'Date', type: 'date' },
    { name: 'Location', type: 'location' },
    { name: 'Severity', type: 'select' },
  ],
  permit: [
    { name: 'Requester', type: 'user' },
    { name: 'Start Date', type: 'date' },
    { name: 'End Date', type: 'date' },
  ],
  audit: [
    { name: 'Auditor', type: 'user' },
    { name: 'Audit Date', type: 'date' },
    { name: 'Area', type: 'location' },
  ],
  action: [
    { name: 'Assignee', type: 'user' },
    { name: 'Due Date', type: 'date' },
    { name: 'Priority', type: 'select' },
  ],
  custom: [
    { name: 'Title', type: 'text' },
    { name: 'Date', type: 'date' },
  ],
};

/**
 * AutoFixService - Categorizes and applies fixes to predictions
 *
 * Safe fixes are auto-applied:
 * - MISSING_REQUIRED_FIELD: Add from pattern default
 * - DUPLICATE_FIELD_NAME: Append suffix (_2, _3)
 * - INVALID_FIELD_ORDER: Reorder per pattern
 * - MISSING_SECTION: Add empty section
 *
 * Unsafe fixes become suggestions:
 * - ORPHAN_REFERENCE: Remove or link
 * - CONFLICTING_TYPES: Present options
 * - SCHEMA_MISMATCH: Show differences
 */
@Injectable()
export class AutoFixService {
  private pendingFixes: Map<string, { fix: AutoFix; prediction: StructurePrediction }> = new Map();

  /**
   * Process validation errors and categorize fixes as safe or unsafe
   */
  async fix(
    prediction: StructurePrediction,
    errors: ValidationError[],
  ): Promise<{ result: AutoFixResult; prediction: StructurePrediction }> {
    const applied: AutoFix[] = [];
    const suggested: AutoFix[] = [];
    const remaining: ValidationError[] = [];

    let currentPrediction = this.deepClone(prediction);

    for (const error of errors) {
      const fix = this.generateFix(error, currentPrediction);

      if (!fix) {
        remaining.push(error);
        continue;
      }

      if (fix.safe) {
        const applyResult = this.applyFix(currentPrediction, fix);
        if (applyResult.applied) {
          currentPrediction = applyResult.prediction;
          applied.push(fix);
        } else {
          remaining.push(error);
        }
      } else {
        fix.id = randomUUID();
        suggested.push(fix);
        this.pendingFixes.set(fix.id, { fix, prediction: currentPrediction });
      }
    }

    return {
      result: { applied, suggested, remaining },
      prediction: currentPrediction,
    };
  }

  /**
   * Apply a suggested fix by its ID
   */
  applySuggestedFix(
    fixId: string,
    prediction: StructurePrediction,
  ): { prediction: StructurePrediction; applied: boolean; fix?: AutoFix } {
    const pending = this.pendingFixes.get(fixId);

    if (!pending) {
      return { prediction, applied: false };
    }

    const result = this.applyFix(prediction, pending.fix);
    if (result.applied) {
      this.pendingFixes.delete(fixId);
    }

    return {
      prediction: result.prediction,
      applied: result.applied,
      fix: pending.fix,
    };
  }

  /**
   * Get pending suggested fixes for a session
   */
  getPendingFixes(): AutoFix[] {
    return Array.from(this.pendingFixes.values()).map((p) => p.fix);
  }

  /**
   * Clear pending fixes (e.g., when session ends)
   */
  clearPendingFixes(): void {
    this.pendingFixes.clear();
  }

  /**
   * Generate a fix for a validation error
   */
  private generateFix(
    error: ValidationError,
    prediction: StructurePrediction,
  ): AutoFix | null {
    const isSafe = this.isSafeFixType(error.code);

    switch (error.code) {
      case ValidationErrorCode.MISSING_SECTIONS:
        return this.generateMissingSectionFix(prediction, isSafe);

      case ValidationErrorCode.MISSING_REQUIRED_FIELDS:
        return this.generateMissingRequiredFieldsFix(error, prediction, isSafe);

      case ValidationErrorCode.DUPLICATE_FIELD_NAME:
        return this.generateDuplicateFieldNameFix(error, prediction, isSafe);

      case ValidationErrorCode.DUPLICATE_SECTION_NAME:
        return this.generateDuplicateSectionNameFix(error, prediction, isSafe);

      case ValidationErrorCode.MISSING_FIELD_TYPE:
      case ValidationErrorCode.INVALID_FIELD_TYPE:
        return this.generateFieldTypeFix(error, prediction, isSafe);

      case 'ORPHAN_REFERENCE':
        return this.generateOrphanReferenceFix(error, prediction);

      case 'CONFLICTING_TYPES':
        return this.generateConflictingTypesFix(error, prediction);

      case 'SCHEMA_MISMATCH':
        return this.generateSchemaMismatchFix(error, prediction);

      default:
        return null;
    }
  }

  /**
   * Check if an error code is a safe fix type
   */
  private isSafeFixType(code: string): boolean {
    return (SAFE_FIX_TYPES as readonly string[]).includes(code);
  }

  /**
   * Generate fix for missing sections
   */
  private generateMissingSectionFix(
    prediction: StructurePrediction,
    safe: boolean,
  ): AutoFix {
    return {
      type: 'add',
      target: 'sections',
      value: {
        name: 'General Information',
        fields: [],
        order: 0,
      } as SectionPrediction,
      safe,
      description: 'Add default "General Information" section',
      errorCode: ValidationErrorCode.MISSING_SECTIONS,
    };
  }

  /**
   * Generate fix for missing required fields
   */
  private generateMissingRequiredFieldsFix(
    error: ValidationError,
    prediction: StructurePrediction,
    safe: boolean,
  ): AutoFix {
    const moduleType = prediction.moduleType || 'custom';
    const requiredFields = REQUIRED_FIELDS_BY_TYPE[moduleType] || REQUIRED_FIELDS_BY_TYPE.custom;

    const existingFieldNames = this.getAllFieldNames(prediction).map((n) => n.toLowerCase());
    const missingFields = requiredFields.filter(
      (f) => !existingFieldNames.some((name) => name.includes(f.name.toLowerCase())),
    );

    const fieldsToAdd: FieldPrediction[] = missingFields.map((f) => ({
      name: f.name,
      type: f.type,
      required: true,
    }));

    return {
      type: 'add',
      target: 'sections[0].fields',
      value: fieldsToAdd,
      safe,
      description: `Add missing required fields: ${missingFields.map((f) => f.name).join(', ')}`,
      errorCode: ValidationErrorCode.MISSING_REQUIRED_FIELDS,
    };
  }

  /**
   * Generate fix for duplicate field names
   */
  private generateDuplicateFieldNameFix(
    error: ValidationError,
    prediction: StructurePrediction,
    safe: boolean,
  ): AutoFix {
    const sectionMatch = error.field?.match(/sections\[(\d+)\]/);
    const sectionIndex = sectionMatch ? parseInt(sectionMatch[1], 10) : 0;

    const section = prediction.sections[sectionIndex];
    if (!section) {
      return {
        type: 'replace',
        target: error.field || 'sections[0]',
        value: null,
        safe: false,
        description: 'Unable to fix duplicate field - section not found',
        errorCode: ValidationErrorCode.DUPLICATE_FIELD_NAME,
      };
    }

    const fieldCounts: Record<string, number> = {};
    const renamedFields = section.fields.map((field) => {
      const lowerName = field.name.toLowerCase();
      fieldCounts[lowerName] = (fieldCounts[lowerName] || 0) + 1;

      if (fieldCounts[lowerName] > 1) {
        return {
          ...field,
          name: `${field.name}_${fieldCounts[lowerName]}`,
        };
      }
      return field;
    });

    return {
      type: 'replace',
      target: `sections[${sectionIndex}].fields`,
      value: renamedFields,
      safe,
      description: 'Rename duplicate fields with numeric suffix',
      errorCode: ValidationErrorCode.DUPLICATE_FIELD_NAME,
    };
  }

  /**
   * Generate fix for duplicate section names
   */
  private generateDuplicateSectionNameFix(
    error: ValidationError,
    prediction: StructurePrediction,
    safe: boolean,
  ): AutoFix {
    const sectionCounts: Record<string, number> = {};
    const renamedSections = prediction.sections.map((section) => {
      const lowerName = section.name.toLowerCase();
      sectionCounts[lowerName] = (sectionCounts[lowerName] || 0) + 1;

      if (sectionCounts[lowerName] > 1) {
        return {
          ...section,
          name: `${section.name}_${sectionCounts[lowerName]}`,
        };
      }
      return section;
    });

    return {
      type: 'replace',
      target: 'sections',
      value: renamedSections,
      safe,
      description: 'Rename duplicate sections with numeric suffix',
      errorCode: ValidationErrorCode.DUPLICATE_SECTION_NAME,
    };
  }

  /**
   * Generate fix for missing or invalid field type
   */
  private generateFieldTypeFix(
    error: ValidationError,
    prediction: StructurePrediction,
    safe: boolean,
  ): AutoFix {
    return {
      type: 'replace',
      target: error.field || '',
      value: 'text',
      safe,
      description: 'Set field type to default "text"',
      errorCode: error.code,
    };
  }

  /**
   * Generate fix for orphan reference (unsafe)
   */
  private generateOrphanReferenceFix(
    error: ValidationError,
    prediction: StructurePrediction,
  ): AutoFix {
    return {
      type: 'remove',
      target: error.field || '',
      value: null,
      safe: false,
      description: 'Remove orphan reference or link to valid target',
      errorCode: 'ORPHAN_REFERENCE',
    };
  }

  /**
   * Generate fix for conflicting types (unsafe)
   */
  private generateConflictingTypesFix(
    error: ValidationError,
    prediction: StructurePrediction,
  ): AutoFix {
    return {
      type: 'replace',
      target: error.field || '',
      value: null,
      safe: false,
      description: 'Resolve type conflict - user must choose correct type',
      errorCode: 'CONFLICTING_TYPES',
    };
  }

  /**
   * Generate fix for schema mismatch (unsafe)
   */
  private generateSchemaMismatchFix(
    error: ValidationError,
    prediction: StructurePrediction,
  ): AutoFix {
    return {
      type: 'replace',
      target: error.field || '',
      value: null,
      safe: false,
      description: 'Schema mismatch detected - review and align with expected schema',
      errorCode: 'SCHEMA_MISMATCH',
    };
  }

  /**
   * Apply a fix to the prediction
   */
  private applyFix(
    prediction: StructurePrediction,
    fix: AutoFix,
  ): { prediction: StructurePrediction; applied: boolean } {
    try {
      const updated = this.deepClone(prediction);

      if (fix.type === 'add') {
        return this.applyAddFix(updated, fix);
      } else if (fix.type === 'replace') {
        return this.applyReplaceFix(updated, fix);
      } else if (fix.type === 'remove') {
        return this.applyRemoveFix(updated, fix);
      }

      return { prediction, applied: false };
    } catch {
      return { prediction, applied: false };
    }
  }

  /**
   * Apply an 'add' type fix
   */
  private applyAddFix(
    prediction: StructurePrediction,
    fix: AutoFix,
  ): { prediction: StructurePrediction; applied: boolean } {
    if (fix.target === 'sections') {
      prediction.sections = prediction.sections || [];
      prediction.sections.push(fix.value as SectionPrediction);
      return { prediction, applied: true };
    }

    if (fix.target.startsWith('sections[') && fix.target.includes('.fields')) {
      const match = fix.target.match(/sections\[(\d+)\]\.fields/);
      if (match) {
        const sectionIndex = parseInt(match[1], 10);
        if (prediction.sections[sectionIndex]) {
          prediction.sections[sectionIndex].fields =
            prediction.sections[sectionIndex].fields || [];

          if (Array.isArray(fix.value)) {
            prediction.sections[sectionIndex].fields.push(
              ...(fix.value as FieldPrediction[]),
            );
          } else {
            prediction.sections[sectionIndex].fields.push(fix.value as FieldPrediction);
          }
          return { prediction, applied: true };
        }
      }
    }

    return { prediction, applied: false };
  }

  /**
   * Apply a 'replace' type fix
   */
  private applyReplaceFix(
    prediction: StructurePrediction,
    fix: AutoFix,
  ): { prediction: StructurePrediction; applied: boolean } {
    if (fix.target === 'sections') {
      prediction.sections = fix.value as SectionPrediction[];
      return { prediction, applied: true };
    }

    const parts = fix.target.split('.');
    let current: Record<string, unknown> = prediction as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
      if (arrayMatch) {
        const arr = current[arrayMatch[1]] as Record<string, unknown>[];
        current = arr[parseInt(arrayMatch[2], 10)];
      } else {
        current = current[part] as Record<string, unknown>;
      }

      if (!current) {
        return { prediction, applied: false };
      }
    }

    const lastPart = parts[parts.length - 1];
    const lastArrayMatch = lastPart.match(/(\w+)\[(\d+)\]/);
    if (lastArrayMatch) {
      const arr = current[lastArrayMatch[1]] as unknown[];
      arr[parseInt(lastArrayMatch[2], 10)] = fix.value;
    } else {
      current[lastPart] = fix.value;
    }

    return { prediction, applied: true };
  }

  /**
   * Apply a 'remove' type fix
   */
  private applyRemoveFix(
    prediction: StructurePrediction,
    fix: AutoFix,
  ): { prediction: StructurePrediction; applied: boolean } {
    const parts = fix.target.split('.');
    let current: Record<string, unknown> = prediction as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
      if (arrayMatch) {
        const arr = current[arrayMatch[1]] as Record<string, unknown>[];
        current = arr[parseInt(arrayMatch[2], 10)];
      } else {
        current = current[part] as Record<string, unknown>;
      }

      if (!current) {
        return { prediction, applied: false };
      }
    }

    const lastPart = parts[parts.length - 1];
    const lastArrayMatch = lastPart.match(/(\w+)\[(\d+)\]/);
    if (lastArrayMatch) {
      const arr = current[lastArrayMatch[1]] as unknown[];
      arr.splice(parseInt(lastArrayMatch[2], 10), 1);
    } else {
      delete current[lastPart];
    }

    return { prediction, applied: true };
  }

  /**
   * Get all field names from prediction
   */
  private getAllFieldNames(prediction: StructurePrediction): string[] {
    return (
      prediction.sections?.flatMap((s) => s.fields?.map((f) => f.name) || []) || []
    );
  }

  /**
   * Deep clone an object
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
