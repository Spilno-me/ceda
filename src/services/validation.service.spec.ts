import { Test, TestingModule } from '@nestjs/testing';
import { CognitiveValidationService, ValidationErrorCode } from './validation.service';
import { StructurePrediction } from '../interfaces';

describe('CognitiveValidationService', () => {
  let service: CognitiveValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CognitiveValidationService],
    }).compile();

    service = module.get<CognitiveValidationService>(CognitiveValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validatePrediction', () => {
    it('should pass valid prediction', () => {
      const prediction = createValidPrediction();
      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch missing module type', () => {
      const prediction = createValidPrediction();
      prediction.moduleType = '';

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.MISSING_MODULE_TYPE)).toBe(true);
    });

    it('should catch missing sections', () => {
      const prediction = createValidPrediction();
      prediction.sections = [];

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.MISSING_SECTIONS)).toBe(true);
    });

    it('should catch invalid field type', () => {
      const prediction = createValidPrediction();
      prediction.sections[0].fields[0].type = 'invalid_type';

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.INVALID_FIELD_TYPE)).toBe(true);
    });

    it('should catch missing field name', () => {
      const prediction = createValidPrediction();
      prediction.sections[0].fields[0].name = '';

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.MISSING_FIELD_NAME)).toBe(true);
    });

    it('should catch duplicate section names', () => {
      const prediction = createValidPrediction();
      prediction.sections.push({
        name: prediction.sections[0].name,
        fields: [],
        order: 1,
      });

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.DUPLICATE_SECTION_NAME)).toBe(true);
    });

    it('should catch duplicate field names in same section', () => {
      const prediction = createValidPrediction();
      prediction.sections[0].fields.push({
        name: prediction.sections[0].fields[0].name,
        type: 'text',
        required: false,
      });

      const result = service.validatePrediction(prediction);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === ValidationErrorCode.DUPLICATE_FIELD_NAME)).toBe(true);
    });

    it('should warn on low confidence', () => {
      const prediction = createValidPrediction();
      prediction.confidence = 0.3;

      const result = service.validatePrediction(prediction);

      expect(result.warnings.some((w) => w.code === ValidationErrorCode.LOW_CONFIDENCE)).toBe(true);
    });

    it('should catch missing required fields', () => {
      const prediction = createValidPrediction();
      // Clear all fields to trigger missing required fields
      prediction.sections[0].fields = [];

      const result = service.validatePrediction(prediction);

      expect(result.errors.some((e) => e.code === ValidationErrorCode.MISSING_REQUIRED_FIELDS)).toBe(true);
    });
  });

  describe('autoFix', () => {
    it('should fix missing field type', () => {
      const prediction = createValidPrediction();
      prediction.sections[0].fields[0].type = '';

      const validation = service.validatePrediction(prediction);
      const { prediction: fixed, appliedFixes } = service.autoFix(prediction, validation);

      expect(appliedFixes.length).toBeGreaterThan(0);
      // Re-validate should have fewer errors
      const revalidation = service.validatePrediction(fixed);
      expect(revalidation.errors.length).toBeLessThanOrEqual(validation.errors.length);
    });

    it('should add missing sections', () => {
      const prediction = createValidPrediction();
      prediction.sections = [];

      const validation = service.validatePrediction(prediction);
      const { prediction: fixed, appliedFixes } = service.autoFix(prediction, validation);

      expect(appliedFixes.some((f) => f.includes('section'))).toBe(true);
      expect(fixed.sections.length).toBeGreaterThan(0);
    });

    it('should return applied fixes list', () => {
      const prediction = createValidPrediction();
      prediction.sections[0].fields[0].type = 'invalid_type';

      const validation = service.validatePrediction(prediction);
      const { appliedFixes } = service.autoFix(prediction, validation);

      expect(Array.isArray(appliedFixes)).toBe(true);
    });
  });

  describe('checkCompleteness', () => {
    it('should report complete prediction', () => {
      const prediction = createCompletePrediction();
      const report = service.checkCompleteness(prediction);

      expect(report.complete).toBe(true);
      expect(report.missingRequired).toHaveLength(0);
    });

    it('should report missing required fields', () => {
      const prediction = createValidPrediction();
      // Remove all fields
      prediction.sections[0].fields = [];

      const report = service.checkCompleteness(prediction);

      expect(report.missingRequired.length).toBeGreaterThan(0);
    });

    it('should calculate completeness score', () => {
      const prediction = createValidPrediction();
      const report = service.checkCompleteness(prediction);

      expect(report.completenessScore).toBeGreaterThanOrEqual(0);
      expect(report.completenessScore).toBeLessThanOrEqual(1);
    });

    it('should report missing recommended fields', () => {
      const prediction = createValidPrediction();
      const report = service.checkCompleteness(prediction);

      expect(Array.isArray(report.missingRecommended)).toBe(true);
    });
  });
});

/**
 * Create a valid prediction for testing
 */
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

/**
 * Create a complete prediction with all required and recommended fields
 */
function createCompletePrediction(): StructurePrediction {
  return {
    moduleType: 'assessment',
    sections: [
      {
        name: 'General Information',
        fields: [
          { name: 'Assessor', type: 'user', required: true },
          { name: 'Date', type: 'date', required: true },
          { name: 'Location', type: 'location', required: true },
          { name: 'Description', type: 'textarea', required: false },
          { name: 'Status', type: 'select', required: false },
          { name: 'Notes', type: 'textarea', required: false },
        ],
        order: 0,
      },
    ],
    confidence: 0.9,
    rationale: 'Complete assessment prediction',
    alternatives: [],
  };
}
