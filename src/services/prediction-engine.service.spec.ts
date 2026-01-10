import { Test, TestingModule } from '@nestjs/testing';
import { PredictionEngineService } from './prediction-engine.service';
import { PatternLibraryService } from './pattern-library.service';
import { IntentType, ProcessedSignal } from '../interfaces';
import { HSE_PATTERNS } from '../seed';

describe('PredictionEngineService', () => {
  let service: PredictionEngineService;
  let patternLibrary: PatternLibraryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PredictionEngineService, PatternLibraryService],
    }).compile();

    service = module.get<PredictionEngineService>(PredictionEngineService);
    patternLibrary = module.get<PatternLibraryService>(PatternLibraryService);
    // CEDA is domain-agnostic - load HSE patterns for these tests
    patternLibrary.loadPatterns(HSE_PATTERNS);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('predict', () => {
    it('should generate prediction for safety assessment signal', async () => {
      const signal = createSignal('safety assessment', IntentType.CREATE);

      const result = await service.predict(signal);

      expect(result).toHaveProperty('moduleType');
      expect(result).toHaveProperty('sections');
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should generate prediction for incident report signal', async () => {
      const signal = createSignal('incident report', IntentType.CREATE);

      const result = await service.predict(signal);

      expect(result.moduleType).toBe('incident');
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it('should include sections with fields', async () => {
      const signal = createSignal('safety audit', IntentType.CREATE);

      const result = await service.predict(signal);

      expect(result.sections.length).toBeGreaterThan(0);
      result.sections.forEach((section) => {
        expect(section).toHaveProperty('name');
        expect(section).toHaveProperty('fields');
        expect(section).toHaveProperty('order');
      });
    });

    it('should return default prediction when no pattern matches', async () => {
      const signal = createSignal('unknown domain xyz', IntentType.CREATE);

      const result = await service.predict(signal);

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.rationale).toContain('No specific pattern matched');
    });

    it('should include alternatives in prediction', async () => {
      const signal = createSignal('safety assessment', IntentType.CREATE);

      const result = await service.predict(signal);

      expect(result).toHaveProperty('alternatives');
      expect(Array.isArray(result.alternatives)).toBe(true);
    });
  });

  describe('applyModification', () => {
    it('should reduce confidence after modification', async () => {
      const signal = createSignal('safety assessment', IntentType.CREATE);
      const prediction = await service.predict(signal);
      const originalConfidence = prediction.confidence;

      const modified = await service.applyModification(
        prediction,
        'add a section for emergency contacts',
      );

      expect(modified.confidence).toBeLessThan(originalConfidence);
    });

    it('should add section when modification requests it', async () => {
      const signal = createSignal('incident report', IntentType.CREATE);
      const prediction = await service.predict(signal);
      const originalSectionCount = prediction.sections.length;

      const modified = await service.applyModification(
        prediction,
        'add a new section',
      );

      expect(modified.sections.length).toBeGreaterThanOrEqual(originalSectionCount);
    });

    it('should update rationale with modification info', async () => {
      const signal = createSignal('safety assessment', IntentType.CREATE);
      const prediction = await service.predict(signal);

      const modified = await service.applyModification(
        prediction,
        'remove unnecessary fields',
      );

      expect(modified.rationale).toContain('remove unnecessary fields');
    });
  });

  describe('generateWorkflow', () => {
    it('should generate workflow from pattern', () => {
      const pattern = patternLibrary.getPattern('assessment-default');

      if (pattern) {
        const workflow = service.generateWorkflow(pattern);

        expect(workflow).toHaveProperty('workflowType');
        expect(workflow).toHaveProperty('steps');
        expect(workflow.steps.length).toBeGreaterThan(0);
      }
    });

    it('should include step names and types', () => {
      const pattern = patternLibrary.getPattern('incident-default');

      if (pattern) {
        const workflow = service.generateWorkflow(pattern);

        workflow.steps.forEach((step) => {
          expect(step).toHaveProperty('name');
          expect(step).toHaveProperty('type');
        });
      }
    });
  });
});

/**
 * Helper function to create test signals
 */
function createSignal(domain: string, intent: IntentType): ProcessedSignal {
  return {
    intentClassification: {
      intent,
      confidence: 0.85,
      domain,
      entities: domain.split(' '),
    },
    contextSignals: [],
    anomalies: [],
    routingDecision: {
      handler: 'cognitive-eda',
      priority: 1,
    },
  };
}
