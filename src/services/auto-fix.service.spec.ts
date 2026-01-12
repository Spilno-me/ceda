import { Test, TestingModule } from '@nestjs/testing';
import { AutoFixService, SAFE_FIX_TYPES, UNSAFE_FIX_TYPES } from './auto-fix.service';
import { ValidationErrorCode } from './validation.service';
import { StructurePrediction, ValidationError } from '../interfaces';

describe('AutoFixService', () => {
  let service: AutoFixService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutoFixService],
    }).compile();

    service = module.get<AutoFixService>(AutoFixService);
  });

  afterEach(() => {
    service.clearPendingFixes();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Safe Fix Types', () => {
    it('should include MISSING_REQUIRED_FIELDS as safe', () => {
      expect(SAFE_FIX_TYPES).toContain(ValidationErrorCode.MISSING_REQUIRED_FIELDS);
    });

    it('should include DUPLICATE_FIELD_NAME as safe', () => {
      expect(SAFE_FIX_TYPES).toContain(ValidationErrorCode.DUPLICATE_FIELD_NAME);
    });

    it('should include MISSING_SECTIONS as safe', () => {
      expect(SAFE_FIX_TYPES).toContain(ValidationErrorCode.MISSING_SECTIONS);
    });

    it('should include DUPLICATE_SECTION_NAME as safe', () => {
      expect(SAFE_FIX_TYPES).toContain(ValidationErrorCode.DUPLICATE_SECTION_NAME);
    });
  });

  describe('Unsafe Fix Types', () => {
    it('should include ORPHAN_REFERENCE as unsafe', () => {
      expect(UNSAFE_FIX_TYPES).toContain('ORPHAN_REFERENCE');
    });

    it('should include CONFLICTING_TYPES as unsafe', () => {
      expect(UNSAFE_FIX_TYPES).toContain('CONFLICTING_TYPES');
    });

    it('should include SCHEMA_MISMATCH as unsafe', () => {
      expect(UNSAFE_FIX_TYPES).toContain('SCHEMA_MISMATCH');
    });
  });

  describe('fix - Safe Fixes', () => {
    it('should auto-apply fix for MISSING_SECTIONS', async () => {
      const prediction = createPredictionWithoutSections();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.MISSING_SECTIONS,
          message: 'At least one section is required',
          severity: 'error',
        },
      ];

      const { result, prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.applied[0].safe).toBe(true);
      expect(result.suggested.length).toBe(0);
      expect(result.remaining.length).toBe(0);
      expect(fixedPrediction.sections.length).toBeGreaterThan(0);
    });

    it('should auto-apply fix for DUPLICATE_FIELD_NAME', async () => {
      const prediction = createPredictionWithDuplicateFields();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: 'sections[0]',
          message: 'Duplicate field names in "General Information": name',
          severity: 'error',
        },
      ];

      const { result, prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.applied[0].safe).toBe(true);

      const fieldNames = fixedPrediction.sections[0].fields.map((f) => f.name);
      const uniqueNames = new Set(fieldNames);
      expect(uniqueNames.size).toBe(fieldNames.length);
    });

    it('should auto-apply fix for DUPLICATE_SECTION_NAME', async () => {
      const prediction = createPredictionWithDuplicateSections();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_SECTION_NAME,
          message: 'Duplicate section names: general information',
          severity: 'error',
        },
      ];

      const { result, prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.applied[0].safe).toBe(true);

      const sectionNames = fixedPrediction.sections.map((s) => s.name);
      const uniqueNames = new Set(sectionNames);
      expect(uniqueNames.size).toBe(sectionNames.length);
    });

    it('should auto-apply fix for MISSING_REQUIRED_FIELDS', async () => {
      const prediction = createPredictionMissingRequiredFields();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.MISSING_REQUIRED_FIELDS,
          message: 'Missing required fields: assessor, date, location',
          severity: 'error',
        },
      ];

      const { result, prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.applied[0].safe).toBe(true);
      expect(fixedPrediction.sections[0].fields.length).toBeGreaterThan(0);
    });

    it('should auto-apply fix for INVALID_FIELD_TYPE', async () => {
      const prediction = createPredictionWithInvalidFieldType();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.INVALID_FIELD_TYPE,
          field: 'sections[0].fields[0].type',
          message: 'Invalid field type "invalid_type" for field "Name"',
          severity: 'error',
        },
      ];

      const { result, prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.applied[0].safe).toBe(true);
      expect(fixedPrediction.sections[0].fields[0].type).toBe('text');
    });
  });

  describe('fix - Unsafe Fixes', () => {
    it('should suggest fix for ORPHAN_REFERENCE instead of auto-applying', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Field references non-existent target',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(0);
      expect(result.suggested.length).toBe(1);
      expect(result.suggested[0].safe).toBe(false);
      expect(result.suggested[0].id).toBeDefined();
    });

    it('should suggest fix for CONFLICTING_TYPES instead of auto-applying', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'CONFLICTING_TYPES',
          field: 'sections[0].fields[0]',
          message: 'Field type conflicts with schema',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(0);
      expect(result.suggested.length).toBe(1);
      expect(result.suggested[0].safe).toBe(false);
    });

    it('should suggest fix for SCHEMA_MISMATCH instead of auto-applying', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'SCHEMA_MISMATCH',
          field: 'sections[0]',
          message: 'Section does not match expected schema',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(0);
      expect(result.suggested.length).toBe(1);
      expect(result.suggested[0].safe).toBe(false);
    });
  });

  describe('fix - Remaining Errors', () => {
    it('should put unknown error codes in remaining', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'UNKNOWN_ERROR_CODE',
          message: 'Some unknown error',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(0);
      expect(result.suggested.length).toBe(0);
      expect(result.remaining.length).toBe(1);
      expect(result.remaining[0].code).toBe('UNKNOWN_ERROR_CODE');
    });
  });

  describe('fix - Mixed Errors', () => {
    it('should handle mix of safe, unsafe, and unknown errors', async () => {
      const prediction = createPredictionWithDuplicateFields();
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: 'sections[0]',
          message: 'Duplicate field names',
          severity: 'error',
        },
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Orphan reference',
          severity: 'error',
        },
        {
          code: 'UNKNOWN_ERROR',
          message: 'Unknown error',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);

      expect(result.applied.length).toBe(1);
      expect(result.suggested.length).toBe(1);
      expect(result.remaining.length).toBe(1);
    });
  });

  describe('applySuggestedFix', () => {
    it('should apply a suggested fix by ID', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Orphan reference',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);
      expect(result.suggested.length).toBe(1);

      const fixId = result.suggested[0].id!;
      const applyResult = service.applySuggestedFix(fixId, prediction);

      expect(applyResult.applied).toBe(true);
      expect(applyResult.fix).toBeDefined();
    });

    it('should return false for non-existent fix ID', () => {
      const prediction = createValidPrediction();
      const result = service.applySuggestedFix('non-existent-id', prediction);

      expect(result.applied).toBe(false);
      expect(result.fix).toBeUndefined();
    });

    it('should remove fix from pending after applying', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Orphan reference',
          severity: 'error',
        },
      ];

      const { result } = await service.fix(prediction, errors);
      const fixId = result.suggested[0].id!;

      service.applySuggestedFix(fixId, prediction);

      const pendingFixes = service.getPendingFixes();
      expect(pendingFixes.find((f) => f.id === fixId)).toBeUndefined();
    });
  });

  describe('getPendingFixes', () => {
    it('should return all pending suggested fixes', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Orphan reference 1',
          severity: 'error',
        },
        {
          code: 'CONFLICTING_TYPES',
          field: 'sections[0].fields[1]',
          message: 'Conflicting types',
          severity: 'error',
        },
      ];

      await service.fix(prediction, errors);

      const pendingFixes = service.getPendingFixes();
      expect(pendingFixes.length).toBe(2);
    });
  });

  describe('clearPendingFixes', () => {
    it('should clear all pending fixes', async () => {
      const prediction = createValidPrediction();
      const errors: ValidationError[] = [
        {
          code: 'ORPHAN_REFERENCE',
          field: 'sections[0].fields[0]',
          message: 'Orphan reference',
          severity: 'error',
        },
      ];

      await service.fix(prediction, errors);
      expect(service.getPendingFixes().length).toBe(1);

      service.clearPendingFixes();
      expect(service.getPendingFixes().length).toBe(0);
    });
  });

  describe('No Data Loss', () => {
    it('should preserve all existing fields when fixing duplicates', async () => {
      const prediction = createPredictionWithDuplicateFields();
      const originalFieldCount = prediction.sections[0].fields.length;
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: 'sections[0]',
          message: 'Duplicate field names',
          severity: 'error',
        },
      ];

      const { prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(fixedPrediction.sections[0].fields.length).toBe(originalFieldCount);
    });

    it('should preserve all existing sections when fixing duplicate names', async () => {
      const prediction = createPredictionWithDuplicateSections();
      const originalSectionCount = prediction.sections.length;
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_SECTION_NAME,
          message: 'Duplicate section names',
          severity: 'error',
        },
      ];

      const { prediction: fixedPrediction } = await service.fix(prediction, errors);

      expect(fixedPrediction.sections.length).toBe(originalSectionCount);
    });

    it('should not modify original prediction object', async () => {
      const prediction = createPredictionWithDuplicateFields();
      const originalJson = JSON.stringify(prediction);
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: 'sections[0]',
          message: 'Duplicate field names',
          severity: 'error',
        },
      ];

      await service.fix(prediction, errors);

      expect(JSON.stringify(prediction)).toBe(originalJson);
    });

    it('should preserve field properties when renaming duplicates', async () => {
      const prediction = createPredictionWithDuplicateFields();
      const originalField = prediction.sections[0].fields[0];
      const errors: ValidationError[] = [
        {
          code: ValidationErrorCode.DUPLICATE_FIELD_NAME,
          field: 'sections[0]',
          message: 'Duplicate field names',
          severity: 'error',
        },
      ];

      const { prediction: fixedPrediction } = await service.fix(prediction, errors);

      const firstField = fixedPrediction.sections[0].fields[0];
      expect(firstField.type).toBe(originalField.type);
      expect(firstField.required).toBe(originalField.required);
    });
  });
});

function createValidPrediction(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [
          { name: 'Assessor', type: 'user', required: true },
          { name: 'Date', type: 'date', required: true },
          { name: 'Location', type: 'location', required: true },
        ],
        order: 0,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}

function createPredictionWithoutSections(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}

function createPredictionWithDuplicateFields(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [
          { name: 'Name', type: 'text', required: true },
          { name: 'Name', type: 'text', required: false },
          { name: 'Date', type: 'date', required: true },
        ],
        order: 0,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}

function createPredictionWithDuplicateSections(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [{ name: 'Name', type: 'text', required: true }],
        order: 0,
      },
      {
        name: 'General Information',
        fields: [{ name: 'Date', type: 'date', required: true }],
        order: 1,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}

function createPredictionMissingRequiredFields(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [],
        order: 0,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}

function createPredictionWithInvalidFieldType(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [
          { name: 'Name', type: 'invalid_type', required: true },
          { name: 'Date', type: 'date', required: true },
        ],
        order: 0,
      },
    ],
    confidence: 0.85,
    rationale: 'Matched assessment pattern',
    alternatives: [],
  };
}
