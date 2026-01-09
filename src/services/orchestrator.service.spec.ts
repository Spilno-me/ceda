import { Test, TestingModule } from '@nestjs/testing';
import { CognitiveOrchestratorService, PipelineStage } from './orchestrator.service';
import { SignalProcessorService } from './signal-processor.service';
import { PatternLibraryService } from './pattern-library.service';
import { PredictionEngineService } from './prediction-engine.service';
import { CognitiveValidationService } from './validation.service';
import { IntentType, ProcessedSignal } from '../interfaces';

describe('CognitiveOrchestratorService', () => {
  let service: CognitiveOrchestratorService;
  let signalProcessor: jest.Mocked<SignalProcessorService>;
  let patternLibrary: jest.Mocked<PatternLibraryService>;
  let predictionEngine: jest.Mocked<PredictionEngineService>;
  let validationService: jest.Mocked<CognitiveValidationService>;

  const mockProcessedSignal: ProcessedSignal = {
    intentClassification: {
      intent: IntentType.CREATE,
      confidence: 0.85,
      entities: ['assessment'],
    },
    contextSignals: [],
    anomalies: [],
    routingDecision: {
      handler: 'cognitive-eda',
      priority: 1,
    },
  };

  const mockPrediction = {
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

  const mockValidationPass = {
    valid: true,
    errors: [],
    warnings: [],
    suggestions: [],
  };

  const mockValidationFail = {
    valid: false,
    errors: [{ code: 'MISSING_FIELD', message: 'Missing required field', severity: 'error' as const }],
    warnings: [],
    suggestions: [
      {
        code: 'ADD_FIELD',
        message: 'Add missing field',
        autoFix: { type: 'add' as const, target: 'sections[0].fields', value: { name: 'Status', type: 'select' } },
      },
    ],
  };

  beforeEach(async () => {
    const mockSignalProcessor = {
      processSignal: jest.fn(),
    };

    const mockPatternLibrary = {
      getAllPatterns: jest.fn().mockReturnValue([]),
      matchPattern: jest.fn(),
    };

    const mockPredictionEngine = {
      predict: jest.fn(),
      applyModification: jest.fn(),
    };

    const mockValidationService = {
      validatePrediction: jest.fn(),
      autoFix: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CognitiveOrchestratorService,
        { provide: SignalProcessorService, useValue: mockSignalProcessor },
        { provide: PatternLibraryService, useValue: mockPatternLibrary },
        { provide: PredictionEngineService, useValue: mockPredictionEngine },
        { provide: CognitiveValidationService, useValue: mockValidationService },
      ],
    }).compile();

    service = module.get<CognitiveOrchestratorService>(CognitiveOrchestratorService);
    signalProcessor = module.get(SignalProcessorService);
    patternLibrary = module.get(PatternLibraryService);
    predictionEngine = module.get(PredictionEngineService);
    validationService = module.get(CognitiveValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should complete full pipeline successfully', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockResolvedValue(mockPrediction);
      validationService.validatePrediction.mockReturnValue(mockValidationPass);

      const result = await service.execute('Create a safety assessment form');

      expect(result.success).toBe(true);
      expect(result.prediction).toEqual(mockPrediction);
      expect(result.validation).toEqual(mockValidationPass);
      expect(result.autoFixed).toBe(false);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle signal processing failure', async () => {
      signalProcessor.processSignal.mockImplementation(() => { throw new Error('Processing failed'); });

      const result = await service.execute('Invalid input');

      expect(result.success).toBe(false);
      expect(result.prediction).toBeNull();
      expect(result.stages.some((s) => s.stage === PipelineStage.SIGNAL_PROCESSING && !s.success)).toBe(true);
    });

    it('should handle prediction failure', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockRejectedValue(new Error('Prediction failed'));

      const result = await service.execute('Create assessment');

      expect(result.success).toBe(false);
      expect(result.stages.some((s) => s.stage === PipelineStage.PREDICTION && !s.success)).toBe(true);
    });

    it('should auto-fix validation errors when enabled', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockResolvedValue(mockPrediction);
      validationService.validatePrediction
        .mockReturnValueOnce(mockValidationFail)
        .mockReturnValue(mockValidationPass);
      validationService.autoFix.mockReturnValue({
        prediction: mockPrediction,
        appliedFixes: ['Added missing field'],
      });

      const result = await service.execute('Create assessment', [], { enableAutoFix: true });

      expect(result.autoFixed).toBe(true);
      expect(result.appliedFixes).toContain('Added missing field');
    });

    it('should skip auto-fix when disabled', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockResolvedValue(mockPrediction);
      validationService.validatePrediction.mockReturnValue(mockValidationFail);

      const result = await service.execute('Create assessment', [], { enableAutoFix: false });

      expect(result.autoFixed).toBe(false);
      expect(validationService.autoFix).not.toHaveBeenCalled();
    });

    it('should respect max auto-fix attempts', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockResolvedValue(mockPrediction);
      validationService.validatePrediction.mockReturnValue(mockValidationFail);
      validationService.autoFix.mockReturnValue({
        prediction: mockPrediction,
        appliedFixes: ['Attempted fix'],
      });

      const result = await service.execute('Create assessment', [], {
        enableAutoFix: true,
        maxAutoFixAttempts: 2,
      });

      expect(validationService.autoFix).toHaveBeenCalledTimes(2);
    });

    it('should track stage durations', async () => {
      signalProcessor.processSignal.mockReturnValue(mockProcessedSignal);
      predictionEngine.predict.mockResolvedValue(mockPrediction);
      validationService.validatePrediction.mockReturnValue(mockValidationPass);

      const result = await service.execute('Create assessment');

      expect(result.stages.length).toBeGreaterThan(0);
      result.stages.forEach((stage) => {
        expect(stage.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('applyModification', () => {
    it('should apply modification and revalidate', async () => {
      const modifiedPrediction = { ...mockPrediction, confidence: 0.8 };
      predictionEngine.applyModification.mockResolvedValue(modifiedPrediction);
      validationService.validatePrediction.mockReturnValue(mockValidationPass);

      const result = await service.applyModification(mockPrediction, 'Add a notes field');

      expect(result.success).toBe(true);
      expect(predictionEngine.applyModification).toHaveBeenCalledWith(mockPrediction, 'Add a notes field');
    });

    it('should auto-fix after modification if needed', async () => {
      const modifiedPrediction = { ...mockPrediction, confidence: 0.8 };
      predictionEngine.applyModification.mockResolvedValue(modifiedPrediction);
      validationService.validatePrediction
        .mockReturnValueOnce(mockValidationFail)
        .mockReturnValue(mockValidationPass);
      validationService.autoFix.mockReturnValue({
        prediction: modifiedPrediction,
        appliedFixes: ['Fixed after modification'],
      });

      const result = await service.applyModification(mockPrediction, 'Remove required field');

      expect(result.autoFixed).toBe(true);
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status', () => {
      patternLibrary.getAllPatterns.mockReturnValue([{ id: '1' }, { id: '2' }] as any);

      const status = service.getHealthStatus();

      expect(status.patternsLoaded).toBe(2);
      expect(status.servicesReady).toBe(true);
    });
  });
});
