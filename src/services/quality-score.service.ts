import { Injectable } from '@nestjs/common';
import {
  Pattern,
  QualityFactors,
  QualityScoreResult,
} from '../interfaces';

/**
 * CEDA-51: Decay configuration for quality score decay model
 * Controls how pattern quality scores decay over time without usage
 */
export interface DecayConfig {
  /** Half-life in days - time for score to decay by half (default: 30) */
  halfLife: number;
  /** Minimum score floor - score cannot decay below this (default: 10) */
  minScore: number;
  /** Boost amount per usage (default: 2) */
  usageBoost: number;
  /** Weight for acceptance rate in decay calculation (default: 0.5) */
  acceptanceWeight: number;
}

/**
 * CEDA-51: Result of decay preview calculation
 */
export interface DecayPreviewResult {
  patternId: string;
  currentScore: number;
  projectedScore: number;
  decayAmount: number;
  daysSinceLastUse: number;
  willDropBelowThreshold: boolean;
  threshold: number;
}

/**
 * CEDA-51: Result of running the decay job
 */
export interface DecayJobResult {
  processedCount: number;
  decayedCount: number;
  droppedBelowThreshold: string[];
  timestamp: Date;
}

/**
 * CEDA-44: Quality Score Service
 * Calculates and manages pattern quality scores based on multiple factors:
 * - Usage frequency: 30%
 * - Acceptance rate: 30%
 * - Consistency: 20%
 * - Recency: 10%
 * - Completeness: 10%
 * 
 * CEDA-51: Extended with decay model for quality score decay over time
 */
@Injectable()
export class QualityScoreService {
  /** Default quality score for patterns without calculated score */
  private static readonly DEFAULT_SCORE = 50;
  
  /** Default threshold for low quality patterns */
  private static readonly DEFAULT_LOW_THRESHOLD = 30;

  /** Quality factor weights */
  private static readonly WEIGHTS = {
    usageFrequency: 0.30,
    acceptanceRate: 0.30,
    consistency: 0.20,
    recency: 0.10,
    completeness: 0.10,
  };

  /** CEDA-51: Default decay configuration */
  private static readonly DEFAULT_DECAY_CONFIG: DecayConfig = {
    halfLife: 30,
    minScore: 10,
    usageBoost: 2,
    acceptanceWeight: 0.5,
  };

  /** CEDA-51: Current decay configuration */
  private decayConfig: DecayConfig = { ...QualityScoreService.DEFAULT_DECAY_CONFIG };

  /**
   * Calculate the quality score for a pattern
   * @param pattern - The pattern to calculate score for
   * @returns Quality score (0-100)
   */
  calculateScore(pattern: Pattern): number {
    const factors = this.getQualityFactors(pattern);
    
    const score = 
      factors.usageFrequency * QualityScoreService.WEIGHTS.usageFrequency +
      factors.acceptanceRate * QualityScoreService.WEIGHTS.acceptanceRate +
      factors.consistency * QualityScoreService.WEIGHTS.consistency +
      factors.recency * QualityScoreService.WEIGHTS.recency +
      factors.completeness * QualityScoreService.WEIGHTS.completeness;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Get the breakdown of quality factors for a pattern
   * @param pattern - The pattern to analyze
   * @returns Quality factors breakdown
   */
  getQualityFactors(pattern: Pattern): QualityFactors {
    return {
      usageFrequency: this.calculateUsageFrequency(pattern),
      acceptanceRate: this.calculateAcceptanceRate(pattern),
      consistency: this.calculateConsistency(pattern),
      recency: this.calculateRecency(pattern),
      completeness: this.calculateCompleteness(pattern),
    };
  }

  /**
   * Flag patterns that are below the quality threshold
   * @param patterns - Array of patterns to check
   * @param threshold - Quality threshold (default: 30)
   * @returns Array of patterns below the threshold
   */
  flagLowQuality(patterns: Pattern[], threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): Pattern[] {
    return patterns.filter(pattern => {
      const score = pattern.qualityScore ?? this.calculateScore(pattern);
      return score < threshold;
    });
  }

  /**
   * Get full quality score result for a pattern
   * @param pattern - The pattern to analyze
   * @param threshold - Quality threshold for low quality determination (default: 30)
   * @returns Full quality score result with breakdown
   */
  getQualityScoreResult(pattern: Pattern, threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): QualityScoreResult {
    const factors = this.getQualityFactors(pattern);
    const score = pattern.qualityScore ?? this.calculateScore(pattern);
    
    return {
      patternId: pattern.id,
      score,
      factors,
      isLowQuality: score < threshold,
      threshold,
    };
  }

  /**
   * Calculate usage frequency factor (0-100)
   * Based on metadata.usageCount
   * Higher usage = higher score
   */
  private calculateUsageFrequency(pattern: Pattern): number {
    const usageCount = pattern.metadata?.usageCount ?? 0;
    
    if (usageCount === 0) return QualityScoreService.DEFAULT_SCORE;
    if (usageCount >= 100) return 100;
    if (usageCount >= 50) return 80;
    if (usageCount >= 20) return 60;
    if (usageCount >= 5) return 40;
    return 20;
  }

  /**
   * Calculate acceptance rate factor (0-100)
   * Based on metadata.successRate (0-1)
   * Higher success rate = higher score
   */
  private calculateAcceptanceRate(pattern: Pattern): number {
    const successRate = pattern.metadata?.successRate ?? 0;
    
    if (successRate === 0 && (pattern.metadata?.usageCount ?? 0) === 0) {
      return QualityScoreService.DEFAULT_SCORE;
    }
    
    return Math.round(successRate * 100);
  }

  /**
   * Calculate consistency factor (0-100)
   * Based on confidence data and grounding count
   * More consistent grounding = higher score
   */
  private calculateConsistency(pattern: Pattern): number {
    const confidence = pattern.confidence;
    
    if (!confidence) {
      return QualityScoreService.DEFAULT_SCORE;
    }

    const groundingCount = confidence.groundingCount ?? 0;
    const baseConfidence = confidence.base ?? 1.0;
    
    const groundingScore = Math.min(groundingCount * 10, 50);
    const confidenceScore = baseConfidence * 50;
    
    return Math.round(groundingScore + confidenceScore);
  }

  /**
   * Calculate recency factor (0-100)
   * Based on metadata.updatedAt and confidence.lastGrounded
   * More recent activity = higher score
   */
  private calculateRecency(pattern: Pattern): number {
    const now = new Date();
    let lastActivity: Date | null = null;

    if (pattern.confidence?.lastGrounded) {
      lastActivity = new Date(pattern.confidence.lastGrounded);
    } else if (pattern.metadata?.updatedAt) {
      lastActivity = new Date(pattern.metadata.updatedAt);
    }

    if (!lastActivity) {
      return QualityScoreService.DEFAULT_SCORE;
    }

    const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceActivity <= 7) return 100;
    if (daysSinceActivity <= 30) return 80;
    if (daysSinceActivity <= 90) return 60;
    if (daysSinceActivity <= 180) return 40;
    if (daysSinceActivity <= 365) return 20;
    return 10;
  }

  /**
   * Calculate completeness factor (0-100)
   * Based on pattern structure completeness
   * More complete structure = higher score
   */
  private calculateCompleteness(pattern: Pattern): number {
    let score = 0;
    const maxScore = 100;
    const checkpoints = 5;
    const pointsPerCheck = maxScore / checkpoints;

    if (pattern.name && pattern.name.length > 0) {
      score += pointsPerCheck;
    }

    if (pattern.description && pattern.description.length > 0) {
      score += pointsPerCheck;
    }

    if (pattern.structure?.sections && pattern.structure.sections.length > 0) {
      score += pointsPerCheck;
    }

    if (pattern.applicabilityRules && pattern.applicabilityRules.length > 0) {
      score += pointsPerCheck;
    }

    if (pattern.structure?.workflows && pattern.structure.workflows.length > 0) {
      score += pointsPerCheck;
    }

    return Math.round(score);
  }

  /**
   * Get the default quality score
   */
  getDefaultScore(): number {
    return QualityScoreService.DEFAULT_SCORE;
  }

  /**
   * Get the default low quality threshold
   */
  getDefaultThreshold(): number {
    return QualityScoreService.DEFAULT_LOW_THRESHOLD;
  }

  /**
   * Get the quality factor weights
   */
  getWeights(): typeof QualityScoreService.WEIGHTS {
    return { ...QualityScoreService.WEIGHTS };
  }

  // ============================================
  // CEDA-51: Quality Decay Methods
  // ============================================

  /**
   * CEDA-51: Get the current decay configuration
   */
  getDecayConfig(): DecayConfig {
    return { ...this.decayConfig };
  }

  /**
   * CEDA-51: Update the decay configuration
   * @param config - Partial decay configuration to update
   */
  setDecayConfig(config: Partial<DecayConfig>): void {
    this.decayConfig = { ...this.decayConfig, ...config };
  }

  /**
   * CEDA-51: Calculate the decay amount for a pattern based on time since last use
   * Uses exponential decay formula: decay = score * (1 - 0.5^(days/halfLife))
   * The acceptance rate is factored in to slow decay for high-performing patterns
   * 
   * @param pattern - The pattern to calculate decay for
   * @returns The decay amount (positive number representing score reduction)
   */
  calculateDecay(pattern: Pattern): number {
    const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
    const daysSinceLastUse = this.getDaysSinceLastUse(pattern);
    
    if (daysSinceLastUse <= 0) {
      return 0;
    }

    const { halfLife, acceptanceWeight } = this.decayConfig;
    const acceptanceRate = pattern.metadata?.successRate ?? 0;
    const acceptanceModifier = 1 - (acceptanceRate * acceptanceWeight);
    const decayFactor = 1 - Math.pow(0.5, daysSinceLastUse / halfLife);
    const decayAmount = currentScore * decayFactor * acceptanceModifier;

    return Math.round(decayAmount * 100) / 100;
  }

  /**
   * CEDA-51: Apply decay to a pattern's quality score
   * Returns the updated pattern with the new quality score
   * Logs a warning if the pattern drops below the threshold
   * 
   * @param pattern - The pattern to apply decay to
   * @param threshold - The threshold to check against (default: 30)
   * @returns The updated pattern with decayed quality score
   */
  applyDecay(pattern: Pattern, threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): Pattern {
    const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
    const decayAmount = this.calculateDecay(pattern);
    const newScore = Math.max(this.decayConfig.minScore, Math.round(currentScore - decayAmount));
    
    const wasAboveThreshold = currentScore >= threshold;
    const isNowBelowThreshold = newScore < threshold;
    
    if (wasAboveThreshold && isNowBelowThreshold) {
      console.log(`[CEDA-51] Pattern ${pattern.id} dropped below threshold ${threshold}: ${currentScore} -> ${newScore}`);
    }

    return {
      ...pattern,
      qualityScore: newScore,
    };
  }

  /**
   * CEDA-51: Boost a pattern's quality score when it is used
   * Increases the score by the configured usageBoost amount
   * Also updates the metadata to reflect the usage
   * 
   * @param pattern - The pattern to boost
   * @returns The updated pattern with boosted quality score
   */
  boostOnUsage(pattern: Pattern): Pattern {
    const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
    const newScore = Math.min(100, currentScore + this.decayConfig.usageBoost);
    const now = new Date();

    return {
      ...pattern,
      qualityScore: newScore,
      metadata: {
        ...pattern.metadata,
        usageCount: (pattern.metadata?.usageCount ?? 0) + 1,
        updatedAt: now,
      },
      confidence: pattern.confidence ? {
        ...pattern.confidence,
        lastGrounded: now,
        groundingCount: pattern.confidence.groundingCount + 1,
      } : {
        base: 1.0,
        lastGrounded: now,
        groundingCount: 1,
        decayRate: 0.01,
      },
    };
  }

  /**
   * CEDA-51: Run the decay job on all provided patterns
   * Applies decay to each pattern and returns the results
   * 
   * @param patterns - Array of patterns to process
   * @param threshold - The threshold to check against (default: 30)
   * @returns DecayJobResult with processed patterns and statistics
   */
  runDecayJob(patterns: Pattern[], threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): { 
    result: DecayJobResult; 
    updatedPatterns: Pattern[];
  } {
    const updatedPatterns: Pattern[] = [];
    const droppedBelowThreshold: string[] = [];
    let decayedCount = 0;

    for (const pattern of patterns) {
      const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
      const decayAmount = this.calculateDecay(pattern);
      
      if (decayAmount > 0) {
        const updatedPattern = this.applyDecay(pattern, threshold);
        updatedPatterns.push(updatedPattern);
        decayedCount++;
        
        const newScore = updatedPattern.qualityScore ?? 0;
        if (currentScore >= threshold && newScore < threshold) {
          droppedBelowThreshold.push(pattern.id);
        }
      } else {
        updatedPatterns.push(pattern);
      }
    }

    const result: DecayJobResult = {
      processedCount: patterns.length,
      decayedCount,
      droppedBelowThreshold,
      timestamp: new Date(),
    };

    console.log(`[CEDA-51] Decay job completed: ${decayedCount}/${patterns.length} patterns decayed, ${droppedBelowThreshold.length} dropped below threshold`);

    return { result, updatedPatterns };
  }

  /**
   * CEDA-51: Preview the decay for a pattern without applying it
   * Useful for showing users what will happen to their pattern
   * 
   * @param pattern - The pattern to preview decay for
   * @param threshold - The threshold to check against (default: 30)
   * @returns DecayPreviewResult with current and projected scores
   */
  getDecayPreview(pattern: Pattern, threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): DecayPreviewResult {
    const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
    const decayAmount = this.calculateDecay(pattern);
    const projectedScore = Math.max(this.decayConfig.minScore, Math.round(currentScore - decayAmount));
    const daysSinceLastUse = this.getDaysSinceLastUse(pattern);

    return {
      patternId: pattern.id,
      currentScore,
      projectedScore,
      decayAmount,
      daysSinceLastUse,
      willDropBelowThreshold: currentScore >= threshold && projectedScore < threshold,
      threshold,
    };
  }

  /**
   * CEDA-51: Get patterns that are approaching the decay threshold
   * Returns patterns whose projected score after decay would be below the threshold
   * 
   * @param patterns - Array of patterns to check
   * @param threshold - The threshold to check against (default: 30)
   * @returns Array of patterns approaching the threshold with their decay previews
   */
  getDecayingPatterns(patterns: Pattern[], threshold: number = QualityScoreService.DEFAULT_LOW_THRESHOLD): {
    pattern: Pattern;
    preview: DecayPreviewResult;
  }[] {
    const decayingPatterns: { pattern: Pattern; preview: DecayPreviewResult }[] = [];

    for (const pattern of patterns) {
      const preview = this.getDecayPreview(pattern, threshold);
      const currentScore = pattern.qualityScore ?? this.calculateScore(pattern);
      
      if (currentScore >= threshold && preview.projectedScore < threshold) {
        decayingPatterns.push({ pattern, preview });
      }
    }

    return decayingPatterns;
  }

  /**
   * CEDA-51: Calculate days since last use for a pattern
   * Uses confidence.lastGrounded or metadata.updatedAt as the last activity timestamp
   * 
   * @param pattern - The pattern to check
   * @returns Number of days since last use (0 if never used or very recent)
   */
  private getDaysSinceLastUse(pattern: Pattern): number {
    const now = new Date();
    let lastActivity: Date | null = null;

    if (pattern.confidence?.lastGrounded) {
      lastActivity = new Date(pattern.confidence.lastGrounded);
    } else if (pattern.metadata?.updatedAt) {
      lastActivity = new Date(pattern.metadata.updatedAt);
    }

    if (!lastActivity) {
      return 0;
    }

    const diffMs = now.getTime() - lastActivity.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  }
}
