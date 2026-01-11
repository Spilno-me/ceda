import { Injectable, Logger } from '@nestjs/common';
import { SignalProcessorService } from './signal-processor.service';
import { PatternLibraryService } from './pattern-library.service';
import { PredictionEngineService } from './prediction-engine.service';
import { CognitiveValidationService } from './validation.service';
import {
  ContextSignal,
  ProcessedSignal,
  StructurePrediction,
  ValidationResult,
  TenantContext,
} from '../interfaces';

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  success: boolean;
  prediction: StructurePrediction | null;
  validation: ValidationResult | null;
  autoFixed: boolean;
  appliedFixes: string[];
  processingTime: number;
  stages: StageResult[];
}

/**
 * Individual stage result for observability
 */
export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Pipeline stages
 */
export enum PipelineStage {
  SIGNAL_PROCESSING = 'signal_processing',
  PATTERN_MATCHING = 'pattern_matching',
  PREDICTION = 'prediction',
  VALIDATION = 'validation',
  AUTO_FIX = 'auto_fix',
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  enableAutoFix: boolean;
  maxAutoFixAttempts: number;
  validationThreshold: number;
  includeAlternatives: boolean;
}

const DEFAULT_CONFIG: PipelineConfig = {
  enableAutoFix: true,
  maxAutoFixAttempts: 3,
  validationThreshold: 0.5,
  includeAlternatives: true,
};

/**
 * CognitiveOrchestrator - Ties all CEDA services together
 *
 * Pipeline: Signal → Process → Match Pattern → Predict → Validate → (Auto-fix) → Result
 *
 * Follows downstream-only principle: no blame, only next steps.
 */
@Injectable()
export class CognitiveOrchestratorService {
  private readonly logger = new Logger(CognitiveOrchestratorService.name);

  constructor(
    private readonly signalProcessor: SignalProcessorService,
    private readonly patternLibrary: PatternLibraryService,
    private readonly predictionEngine: PredictionEngineService,
    private readonly validationService: CognitiveValidationService,
  ) {}

  /**
   * Execute full cognitive pipeline
   * @param userInput - The user's natural language input
   * @param context - Optional context signals
   * @param config - Optional pipeline configuration
   * @param tenantContext - Optional tenant context for multi-tenant filtering
   */
  async execute(
    userInput: string,
    context: ContextSignal[] = [],
    config: Partial<PipelineConfig> = {},
    tenantContext?: TenantContext,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    let processedSignal: ProcessedSignal | null = null;
    let prediction: StructurePrediction | null = null;
    let validation: ValidationResult | null = null;
    let autoFixed = false;
    let appliedFixes: string[] = [];

    try {
      // Stage 1: Signal Processing
      const signalResult = await this.executeStage(
        PipelineStage.SIGNAL_PROCESSING,
        async () => {
          processedSignal = this.signalProcessor.processSignal(userInput, { context });
          return processedSignal;
        },
      );
      stages.push(signalResult);
      if (!signalResult.success || !processedSignal) {
        return this.buildResult(false, null, null, false, [], startTime, stages);
      }

      // Stage 2: Prediction
      const predictionResult = await this.executeStage(
        PipelineStage.PREDICTION,
        async () => {
          prediction = await this.predictionEngine.predict(processedSignal!, tenantContext);
          return prediction;
        },
      );
      stages.push(predictionResult);
      if (!predictionResult.success || !prediction) {
        return this.buildResult(false, null, null, false, [], startTime, stages);
      }

      // Stage 3: Validation
      const validationResult = await this.executeStage(
        PipelineStage.VALIDATION,
        async () => {
          validation = this.validationService.validatePrediction(prediction!);
          return validation;
        },
      );
      stages.push(validationResult);
      if (!validationResult.success) {
        return this.buildResult(false, prediction, null, false, [], startTime, stages);
      }

      // Stage 4: Auto-fix (if enabled and needed)
      if (mergedConfig.enableAutoFix && validation && !(validation as ValidationResult).valid) {
        const autoFixResult = await this.executeStage(
          PipelineStage.AUTO_FIX,
          async () => {
            let attempts = 0;
            let currentPrediction = prediction!;
            let currentValidation = validation!;

            while (!currentValidation.valid && attempts < mergedConfig.maxAutoFixAttempts) {
              const fixResult = this.validationService.autoFix(currentPrediction, currentValidation);
              currentPrediction = fixResult.prediction;
              appliedFixes.push(...fixResult.appliedFixes);
              currentValidation = this.validationService.validatePrediction(currentPrediction);
              attempts++;
            }

            if (appliedFixes.length > 0) {
              prediction = currentPrediction;
              validation = currentValidation;
              autoFixed = true;
            }

            return { prediction: currentPrediction, validation: currentValidation };
          },
        );
        stages.push(autoFixResult);
      }

      // Check final validation state
      const success = (validation as ValidationResult | null)?.valid ?? false;

      return this.buildResult(
        success,
        prediction,
        validation,
        autoFixed,
        appliedFixes,
        startTime,
        stages,
      );
    } catch (error) {
      this.logger.error('Pipeline execution failed', error);
      return this.buildResult(false, prediction, validation, autoFixed, appliedFixes, startTime, stages);
    }
  }

  /**
   * Execute a single pipeline stage with timing and error handling
   */
  private async executeStage<T>(
    stage: PipelineStage,
    fn: () => Promise<T>,
  ): Promise<StageResult> {
    const stageStart = Date.now();
    try {
      await fn();
      return {
        stage,
        success: true,
        duration: Date.now() - stageStart,
      };
    } catch (error) {
      this.logger.error(`Stage ${stage} failed`, error);
      return {
        stage,
        success: false,
        duration: Date.now() - stageStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build final pipeline result
   */
  private buildResult(
    success: boolean,
    prediction: StructurePrediction | null,
    validation: ValidationResult | null,
    autoFixed: boolean,
    appliedFixes: string[],
    startTime: number,
    stages: StageResult[],
  ): PipelineResult {
    return {
      success,
      prediction,
      validation,
      autoFixed,
      appliedFixes,
      processingTime: Date.now() - startTime,
      stages,
    };
  }

  /**
   * Apply user modification to existing prediction
   */
  async applyModification(
    prediction: StructurePrediction,
    modification: string,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];

    try {
      // Apply modification
      const modifiedPrediction = await this.predictionEngine.applyModification(
        prediction,
        modification,
      );

      // Validate modified prediction
      const validation = this.validationService.validatePrediction(modifiedPrediction);

      // Auto-fix if needed
      let finalPrediction = modifiedPrediction;
      let appliedFixes: string[] = [];
      let autoFixed = false;

      if (!validation.valid) {
        const fixResult = this.validationService.autoFix(modifiedPrediction, validation);
        if (fixResult.appliedFixes.length > 0) {
          finalPrediction = fixResult.prediction;
          appliedFixes = fixResult.appliedFixes;
          autoFixed = true;
        }
      }

      const finalValidation = this.validationService.validatePrediction(finalPrediction);

      return this.buildResult(
        finalValidation.valid,
        finalPrediction,
        finalValidation,
        autoFixed,
        appliedFixes,
        startTime,
        stages,
      );
    } catch (error) {
      this.logger.error('Modification failed', error);
      return this.buildResult(false, prediction, null, false, [], startTime, stages);
    }
  }

  /**
   * Get alternatives for current prediction
   */
  async getAlternatives(
    signal: ProcessedSignal,
    currentPatternId: string,
    limit: number = 3,
  ): Promise<StructurePrediction[]> {
    const patterns = this.patternLibrary.getAllPatterns();
    const alternatives: StructurePrediction[] = [];

    for (const pattern of patterns) {
      if (pattern.id === currentPatternId) continue;
      if (alternatives.length >= limit) break;

      const match = this.patternLibrary.matchPattern(signal.intentClassification);
      if (match && match.score > 0.3) {
        const prediction = await this.predictionEngine.predict(signal);
        alternatives.push(prediction);
      }
    }

    return alternatives;
  }

  /**
   * Get pipeline health status
   */
  getHealthStatus(): {
    patternsLoaded: number;
    servicesReady: boolean;
  } {
    return {
      patternsLoaded: this.patternLibrary.getAllPatterns().length,
      servicesReady: true,
    };
  }
}
