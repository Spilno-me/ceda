import { Injectable, Logger } from '@nestjs/common';
import { SignalProcessorService } from './signal-processor.service';
import { PatternLibraryService } from './pattern-library.service';
import { PredictionEngineService } from './prediction-engine.service';
import { CognitiveValidationService } from './validation.service';
import { TenantEmbeddingService, TenantEmbeddingContext } from './tenant-embedding.service';
import { VectorStoreService } from './vector-store.service';
import {
  ContextSignal,
  ProcessedSignal,
  StructurePrediction,
  ValidationResult,
  TenantContext,
} from '../interfaces';

/**
 * CEDA-21: Outcome types for learning
 */
export type OutcomeType = 'success' | 'failure';

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
  private tenantEmbeddingService: TenantEmbeddingService | null = null;
  private vectorStoreService: VectorStoreService | null = null;

  constructor(
    private readonly signalProcessor: SignalProcessorService,
    private readonly patternLibrary: PatternLibraryService,
    private readonly predictionEngine: PredictionEngineService,
    private readonly validationService: CognitiveValidationService,
  ) {}

  /**
   * Set the tenant embedding service for AI-native multi-tenancy
   * This enables context-aware pattern retrieval using embedding fusion
   */
  setTenantEmbeddingService(service: TenantEmbeddingService): void {
    this.tenantEmbeddingService = service;
    this.logger.log('TenantEmbeddingService configured for AI-native multi-tenancy');
  }

  /**
   * Set the vector store service for outcome learning
   * Required for CEDA-21: Pattern affinity updates
   */
  setVectorStoreService(service: VectorStoreService): void {
    this.vectorStoreService = service;
    this.logger.log('VectorStoreService configured for outcome learning');
  }

  /**
   * CEDA-21: Record outcome to update pattern affinity
   * Call this after user accepts/rejects a prediction to improve future rankings
   *
   * @param patternId - The pattern that was used in the prediction
   * @param tenantId - The tenant who received the prediction
   * @param outcome - 'success' (accepted) or 'failure' (rejected)
   */
  async recordOutcome(
    patternId: string,
    tenantId: string,
    outcome: OutcomeType,
  ): Promise<boolean> {
    if (!this.tenantEmbeddingService || !this.vectorStoreService) {
      this.logger.warn('Cannot record outcome - services not configured');
      return false;
    }

    const tenantContext = await this.tenantEmbeddingService.getContext(tenantId);
    if (!tenantContext) {
      this.logger.warn(`Cannot record outcome - tenant not found: ${tenantId}`);
      return false;
    }

    // Apply learning delta: +0.1 for success, -0.1 for failure
    const delta = outcome === 'success' ? 0.1 : -0.1;

    const success = await this.vectorStoreService.updatePatternAffinity(
      patternId,
      tenantContext.embedding,
      delta,
    );

    if (success) {
      this.logger.log(`Recorded ${outcome} outcome for pattern ${patternId}, tenant ${tenantId}`);
    }

    return success;
  }

  /**
   * Get tenant embedding context, initializing on-the-fly if needed
   */
  private async getTenantEmbeddingContext(tenantContext?: TenantContext): Promise<TenantEmbeddingContext | null> {
    if (!this.tenantEmbeddingService || !tenantContext?.company) {
      return null;
    }

    let embeddingContext = await this.tenantEmbeddingService.getContext(tenantContext.company);

    if (!embeddingContext) {
      this.logger.log(`Initializing tenant embedding on-the-fly: ${tenantContext.company}`);
      embeddingContext = await this.tenantEmbeddingService.initialize(
        tenantContext.company,
        `Domain for ${tenantContext.company}`,
      );
    }

    return embeddingContext;
  }

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
      // Get tenant embedding context for AI-native multi-tenancy
      const tenantEmbeddingContext = await this.getTenantEmbeddingContext(tenantContext);
      if (tenantEmbeddingContext) {
        this.logger.log(`Using AI-native multi-tenancy for tenant: ${tenantEmbeddingContext.tenantId}`);
      }

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

      // Stage 2: Prediction (with tenant embedding context for AI-native retrieval)
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
