// CEDA - Cognitive Event-Driven Architecture
// AI-native copilot layer

// Interfaces
export * from './interfaces';

// Services
export { SignalProcessorService } from './services/signal-processor.service';
export { PatternLibraryService } from './services/pattern-library.service';
export { PredictionEngineService } from './services/prediction-engine.service';
export { CognitiveValidationService } from './services/validation.service';
export { CognitiveOrchestratorService, PipelineResult, PipelineStage, PipelineConfig } from './services/orchestrator.service';
export { FeedbackService, UserFeedback, LearningSignal, FeedbackStats } from './services/feedback.service';
