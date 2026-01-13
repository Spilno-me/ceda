import { Injectable } from '@nestjs/common';
import {
  Pattern,
  QualityFactors,
  QualityScoreResult,
} from '../interfaces';

/**
 * CEDA-44: Quality Score Service
 * Calculates and manages pattern quality scores based on multiple factors:
 * - Usage frequency: 30%
 * - Acceptance rate: 30%
 * - Consistency: 20%
 * - Recency: 10%
 * - Completeness: 10%
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
}
