export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  code: string;
  field?: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  code: string;
  field?: string;
  message: string;
  severity: 'warning';
}

export interface ValidationSuggestion {
  code: string;
  field?: string;
  message: string;
  autoFix?: AutoFix;
}

export interface AutoFix {
  id?: string;
  type: 'replace' | 'add' | 'remove';
  target: string;
  value: unknown;
  safe?: boolean;
  description?: string;
  errorCode?: string;
}

export interface AutoFixResult {
  applied: AutoFix[];
  suggested: AutoFix[];
  remaining: ValidationError[];
}

export interface CompletenessReport {
  complete: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  completenessScore: number;
}
