import { Injectable } from '@nestjs/common';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion,
  AutoFix,
  CompletenessReport,
  StructurePrediction,
  SectionPrediction,
  FieldPrediction,
} from '../interfaces';

/**
 * Validation error codes for structure predictions
 */
export enum ValidationErrorCode {
  MISSING_MODULE_TYPE = 'MISSING_MODULE_TYPE',
  MISSING_SECTIONS = 'MISSING_SECTIONS',
  EMPTY_SECTION = 'EMPTY_SECTION',
  MISSING_FIELD_NAME = 'MISSING_FIELD_NAME',
  MISSING_FIELD_TYPE = 'MISSING_FIELD_TYPE',
  INVALID_FIELD_TYPE = 'INVALID_FIELD_TYPE',
  DUPLICATE_FIELD_NAME = 'DUPLICATE_FIELD_NAME',
  DUPLICATE_SECTION_NAME = 'DUPLICATE_SECTION_NAME',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
}

/**
 * Valid field types in the system
 */
const VALID_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'file',
  'image',
  'signature',
  'location',
  'user',
  'email',
  'phone',
  'url',
  'matrix',
  'checklist',
];

/**
 * Required fields for different module types
 */
const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  assessment: ['assessor', 'date', 'location'],
  incident: ['reporter', 'date', 'location', 'severity'],
  permit: ['requester', 'startDate', 'endDate'],
  audit: ['auditor', 'auditDate', 'area'],
  action: ['assignee', 'dueDate', 'priority'],
  custom: ['title', 'date'],
};

@Injectable()
export class CognitiveValidationService {
  /**
   * Validate a structure prediction before presenting to user
   */
  validatePrediction(prediction: StructurePrediction): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: ValidationSuggestion[] = [];

    // Validate module type
    this.validateModuleType(prediction, errors, warnings);

    // Validate sections
    this.validateSections(prediction, errors, warnings, suggestions);

    // Validate fields across all sections
    this.validateFields(prediction, errors, warnings, suggestions);

    // Validate confidence
    this.validateConfidence(prediction, warnings);

    // Check for required fields
    this.validateRequiredFields(prediction, errors, suggestions);

    // Check for duplicates
    this.checkDuplicates(prediction, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Auto-fix recoverable errors in prediction
   */
  autoFix(
    prediction: StructurePrediction,
    validation: ValidationResult,
  ): { prediction: StructurePrediction; appliedFixes: string[] } {
    let updated = { ...prediction };
    const appliedFixes: string[] = [];

    for (const suggestion of validation.suggestions) {
      if (suggestion.autoFix) {
        const result = this.applyAutoFix(updated, suggestion.autoFix);
        if (result.applied) {
          updated = result.prediction;
          appliedFixes.push(suggestion.message);
        }
      }
    }

    return { prediction: updated, appliedFixes };
  }

  /**
   * Check completeness of a prediction
   */
  checkCompleteness(prediction: StructurePrediction): CompletenessReport {
    const requiredFields = REQUIRED_FIELDS_BY_TYPE[prediction.moduleType] || REQUIRED_FIELDS_BY_TYPE.custom;
    const presentFieldNames = this.getAllFieldNames(prediction);

    const missingRequired = requiredFields.filter(
      (f) => !presentFieldNames.some((name) => name.toLowerCase().includes(f.toLowerCase())),
    );

    const recommendedFields = ['description', 'status', 'notes'];
    const missingRecommended = recommendedFields.filter(
      (f) => !presentFieldNames.some((name) => name.toLowerCase().includes(f.toLowerCase())),
    );

    const totalExpected = requiredFields.length + recommendedFields.length;
    const present = totalExpected - missingRequired.length - missingRecommended.length;
    const completenessScore = totalExpected > 0 ? present / totalExpected : 1;

    return {
      complete: missingRequired.length === 0,
      missingRequired,
      missingRecommended,
      completenessScore,
    };
  }

  /**
   * Validate module type
   */
  private validateModuleType(
    prediction: StructurePrediction,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (!prediction.moduleType) {
      errors.push({
        code: ValidationErrorCode.MISSING_MODULE_TYPE,
        message: 'Module type is required',
        severity: 'error',
      });
    }

    if (prediction.moduleType === 'custom') {
      warnings.push({
        code: 'CUSTOM_MODULE_TYPE',
        message: 'Using generic custom module type. Consider using a specific pattern.',
        severity: 'warning',
      });
    }
  }

  /**
   * Validate sections structure
   */
  private validateSections(
    prediction: StructurePrediction,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[],
  ): void {
    if (!prediction.sections || prediction.sections.length === 0) {
      errors.push({
        code: ValidationErrorCode.MISSING_SECTIONS,
        message: 'At least one section is required',
        severity: 'error',
      });
      suggestions.push({
        code: 'ADD_DEFAULT_SECTION',
        message: 'Add a default "General Information" section',
        autoFix: {
          type: 'add',
          target: 'sections',
          value: {
            name: 'General Information',
            fields: [],
            order: 0,
          },
        },
      });
      return;
    }

    prediction.sections.forEach((section, index) => {
      if (!section.name) {
        errors.push({
          code: ValidationErrorCode.EMPTY_SECTION,
          field: `sections[${index}].name`,
          message: `Section at index ${index} is missing a name`,
          severity: 'error',
        });
      }

      if (!section.fields || section.fields.length === 0) {
        warnings.push({
          code: 'EMPTY_SECTION_FIELDS',
          field: `sections[${index}].fields`,
          message: `Section "${section.name || index}" has no fields`,
          severity: 'warning',
        });
      }
    });
  }

  /**
   * Validate fields in all sections
   */
  private validateFields(
    prediction: StructurePrediction,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    suggestions: ValidationSuggestion[],
  ): void {
    prediction.sections?.forEach((section, sectionIndex) => {
      section.fields?.forEach((field, fieldIndex) => {
        const fieldPath = `sections[${sectionIndex}].fields[${fieldIndex}]`;

        // Validate field name
        if (!field.name || field.name.trim() === '') {
          errors.push({
            code: ValidationErrorCode.MISSING_FIELD_NAME,
            field: `${fieldPath}.name`,
            message: `Field at ${fieldPath} is missing a name`,
            severity: 'error',
          });
        }

        // Validate field type
        if (!field.type) {
          errors.push({
            code: ValidationErrorCode.MISSING_FIELD_TYPE,
            field: `${fieldPath}.type`,
            message: `Field "${field.name}" is missing a type`,
            severity: 'error',
          });
          suggestions.push({
            code: 'SET_DEFAULT_FIELD_TYPE',
            field: `${fieldPath}.type`,
            message: `Set default type "text" for field "${field.name}"`,
            autoFix: {
              type: 'replace',
              target: `${fieldPath}.type`,
              value: 'text',
            },
          });
        } else if (!VALID_FIELD_TYPES.includes(field.type)) {
          errors.push({
            code: ValidationErrorCode.INVALID_FIELD_TYPE,
            field: `${fieldPath}.type`,
            message: `Invalid field type "${field.type}" for field "${field.name}"`,
            severity: 'error',
          });
          suggestions.push({
            code: 'FIX_FIELD_TYPE',
            field: `${fieldPath}.type`,
            message: `Change invalid type "${field.type}" to "text"`,
            autoFix: {
              type: 'replace',
              target: `${fieldPath}.type`,
              value: 'text',
            },
          });
        }
      });
    });
  }

  /**
   * Validate confidence score
   */
  private validateConfidence(
    prediction: StructurePrediction,
    warnings: ValidationWarning[],
  ): void {
    if (prediction.confidence < 0.5) {
      warnings.push({
        code: ValidationErrorCode.LOW_CONFIDENCE,
        message: `Low confidence score (${Math.round(prediction.confidence * 100)}%). Review prediction carefully.`,
        severity: 'warning',
      });
    }
  }

  /**
   * Validate required fields for module type
   */
  private validateRequiredFields(
    prediction: StructurePrediction,
    errors: ValidationError[],
    suggestions: ValidationSuggestion[],
  ): void {
    const requiredFields = REQUIRED_FIELDS_BY_TYPE[prediction.moduleType] || REQUIRED_FIELDS_BY_TYPE.custom;
    const presentFieldNames = this.getAllFieldNames(prediction);

    const missingRequired = requiredFields.filter(
      (f) => !presentFieldNames.some((name) => name.toLowerCase().includes(f.toLowerCase())),
    );

    if (missingRequired.length > 0) {
      errors.push({
        code: ValidationErrorCode.MISSING_REQUIRED_FIELDS,
        message: `Missing required fields: ${missingRequired.join(', ')}`,
        severity: 'error',
      });

      // Suggest adding missing required fields
      missingRequired.forEach((fieldName) => {
        suggestions.push({
          code: 'ADD_REQUIRED_FIELD',
          message: `Add required field "${fieldName}"`,
          autoFix: {
            type: 'add',
            target: 'sections[0].fields',
            value: {
              name: this.formatFieldName(fieldName),
              type: this.inferFieldType(fieldName),
              required: true,
            },
          },
        });
      });
    }
  }

  /**
   * Check for duplicate names
   */
  private checkDuplicates(
    prediction: StructurePrediction,
    errors: ValidationError[],
  ): void {
    // Check section duplicates
    const sectionNames = prediction.sections?.map((s) => s.name.toLowerCase()) || [];
    const duplicateSections = sectionNames.filter(
      (name, index) => sectionNames.indexOf(name) !== index,
    );

    if (duplicateSections.length > 0) {
      errors.push({
        code: ValidationErrorCode.DUPLICATE_SECTION_NAME,
        message: `Duplicate section names: ${[...new Set(duplicateSections)].join(', ')}`,
        severity: 'error',
      });
    }

    // Check field duplicates within sections
    prediction.sections?.forEach((section, sectionIndex) => {
      const fieldNames = section.fields?.map((f) => f.name.toLowerCase()) || [];
      const duplicateFields = fieldNames.filter(
        (name, index) => fieldNames.indexOf(name) !== index,
      );

      if (duplicateFields.length > 0) {
        errors.push({
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: `sections[${sectionIndex}]`,
          message: `Duplicate field names in "${section.name}": ${[...new Set(duplicateFields)].join(', ')}`,
          severity: 'error',
        });
      }
    });
  }

  /**
   * Apply an auto-fix to prediction
   */
  private applyAutoFix(
    prediction: StructurePrediction,
    fix: AutoFix,
  ): { prediction: StructurePrediction; applied: boolean } {
    try {
      const updated = JSON.parse(JSON.stringify(prediction)); // Deep clone

      if (fix.type === 'add') {
        if (fix.target === 'sections') {
          updated.sections = updated.sections || [];
          updated.sections.push(fix.value);
        } else if (fix.target.startsWith('sections[') && fix.target.includes('.fields')) {
          const match = fix.target.match(/sections\[(\d+)\]\.fields/);
          if (match) {
            const sectionIndex = parseInt(match[1], 10);
            if (updated.sections[sectionIndex]) {
              updated.sections[sectionIndex].fields = updated.sections[sectionIndex].fields || [];
              updated.sections[sectionIndex].fields.push(fix.value);
            }
          }
        }
      } else if (fix.type === 'replace') {
        // Navigate to target and replace value
        const parts = fix.target.split('.');
        let current: Record<string, unknown> = updated;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
          if (arrayMatch) {
            current = (current[arrayMatch[1]] as Record<string, unknown>[])[parseInt(arrayMatch[2], 10)] as Record<string, unknown>;
          } else {
            current = current[part] as Record<string, unknown>;
          }
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = fix.value;
      }

      return { prediction: updated, applied: true };
    } catch {
      return { prediction, applied: false };
    }
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
   * Format field name for display
   */
  private formatFieldName(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
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
    if (lowerName.includes('location') || lowerName.includes('area')) return 'location';
    if (lowerName.includes('assignee') || lowerName.includes('user') || lowerName.includes('reporter')) return 'user';
    if (lowerName.includes('priority') || lowerName.includes('severity') || lowerName.includes('status')) return 'select';
    if (lowerName.includes('description') || lowerName.includes('notes')) return 'textarea';

    return 'text';
  }
}
