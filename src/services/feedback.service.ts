import { Injectable, Logger } from '@nestjs/common';
import { StructurePrediction, ProcessedSignal } from '../interfaces';

/**
 * Feedback types for learning loop
 */
export enum FeedbackType {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
  ALTERNATIVE_SELECTED = 'alternative_selected',
}

/**
 * User feedback on a prediction
 */
export interface UserFeedback {
  id: string;
  sessionId: string;
  timestamp: Date;
  feedbackType: FeedbackType;
  originalPrediction: StructurePrediction;
  finalPrediction: StructurePrediction | null;
  modifications: ModificationRecord[];
  processingTime: number;
  userContext: UserContext;
}

/**
 * Record of a single modification
 */
export interface ModificationRecord {
  timestamp: Date;
  action: ModificationAction;
  target: string;
  before: unknown;
  after: unknown;
  userIntent?: string;
}

/**
 * Modification actions
 */
export enum ModificationAction {
  ADD_FIELD = 'add_field',
  REMOVE_FIELD = 'remove_field',
  RENAME_FIELD = 'rename_field',
  CHANGE_TYPE = 'change_type',
  REORDER = 'reorder',
  ADD_SECTION = 'add_section',
  REMOVE_SECTION = 'remove_section',
  RENAME_SECTION = 'rename_section',
  CHANGE_MODULE_TYPE = 'change_module_type',
}

/**
 * User context for feedback
 */
export interface UserContext {
  userId: string;
  companyId: string;
  moduleContext?: string;
  previousInteractions: number;
}

/**
 * Learning signal derived from feedback
 */
export interface LearningSignal {
  signalType: LearningSignalType;
  weight: number;
  patternId: string;
  feedback: UserFeedback;
  derivedInsights: DerivedInsight[];
}

/**
 * Types of learning signals
 */
export enum LearningSignalType {
  POSITIVE_REINFORCEMENT = 'positive_reinforcement',
  NEGATIVE_REINFORCEMENT = 'negative_reinforcement',
  PATTERN_CORRECTION = 'pattern_correction',
  NEW_PATTERN_CANDIDATE = 'new_pattern_candidate',
}

/**
 * Insight derived from feedback analysis
 */
export interface DerivedInsight {
  type: InsightType;
  description: string;
  confidence: number;
  evidence: string[];
}

/**
 * Types of derived insights
 */
export enum InsightType {
  COMMON_ADDITION = 'common_addition',
  COMMON_REMOVAL = 'common_removal',
  PREFERRED_ORDERING = 'preferred_ordering',
  FIELD_TYPE_PREFERENCE = 'field_type_preference',
  NAMING_CONVENTION = 'naming_convention',
}

/**
 * Feedback statistics
 */
export interface FeedbackStats {
  totalFeedback: number;
  acceptanceRate: number;
  modificationRate: number;
  rejectionRate: number;
  averageModificationsPerSession: number;
  topModificationActions: { action: ModificationAction; count: number }[];
  patternPerformance: { patternId: string; acceptanceRate: number }[];
}

/**
 * FeedbackService - Learning loop for Cognitive EDA
 *
 * Captures user corrections and acceptances to improve pattern matching
 * and prediction accuracy over time.
 *
 * Follows downstream-only: we learn from user choices without blame.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private feedbackStore: Map<string, UserFeedback> = new Map();
  private sessionModifications: Map<string, ModificationRecord[]> = new Map();

  /**
   * Start tracking a new prediction session
   */
  startSession(
    sessionId: string,
    prediction: StructurePrediction,
    signal: ProcessedSignal,
    userContext: UserContext,
  ): void {
    this.logger.log(`Starting feedback session: ${sessionId}`);
    this.sessionModifications.set(sessionId, []);
  }

  /**
   * Record a modification during session
   */
  recordModification(
    sessionId: string,
    action: ModificationAction,
    target: string,
    before: unknown,
    after: unknown,
    userIntent?: string,
  ): void {
    const modifications = this.sessionModifications.get(sessionId) || [];
    modifications.push({
      timestamp: new Date(),
      action,
      target,
      before,
      after,
      userIntent,
    });
    this.sessionModifications.set(sessionId, modifications);

    this.logger.debug(`Recorded modification in session ${sessionId}: ${action} on ${target}`);
  }

  /**
   * Submit final feedback when session ends
   */
  submitFeedback(
    sessionId: string,
    feedbackType: FeedbackType,
    originalPrediction: StructurePrediction,
    finalPrediction: StructurePrediction | null,
    userContext: UserContext,
    processingTime: number,
  ): UserFeedback {
    const modifications = this.sessionModifications.get(sessionId) || [];

    const feedback: UserFeedback = {
      id: this.generateId(),
      sessionId,
      timestamp: new Date(),
      feedbackType,
      originalPrediction,
      finalPrediction,
      modifications,
      processingTime,
      userContext,
    };

    this.feedbackStore.set(feedback.id, feedback);
    this.sessionModifications.delete(sessionId);

    this.logger.log(`Feedback submitted: ${feedback.id} (${feedbackType})`);

    return feedback;
  }

  /**
   * Derive learning signals from feedback
   */
  deriveLearningSignals(feedback: UserFeedback): LearningSignal[] {
    const signals: LearningSignal[] = [];
    const patternId = this.extractPatternId(feedback.originalPrediction);

    // Base signal from feedback type
    const baseSignal = this.createBaseSignal(feedback, patternId);
    signals.push(baseSignal);

    // Derive insights from modifications
    if (feedback.modifications.length > 0) {
      const insights = this.analyzeModifications(feedback.modifications);
      if (insights.length > 0) {
        signals.push({
          signalType: LearningSignalType.PATTERN_CORRECTION,
          weight: 0.7,
          patternId,
          feedback,
          derivedInsights: insights,
        });
      }
    }

    // Check for new pattern candidate
    if (this.isNewPatternCandidate(feedback)) {
      signals.push({
        signalType: LearningSignalType.NEW_PATTERN_CANDIDATE,
        weight: 0.5,
        patternId: 'new',
        feedback,
        derivedInsights: [
          {
            type: InsightType.COMMON_ADDITION,
            description: 'User created significantly different structure',
            confidence: 0.6,
            evidence: [`${feedback.modifications.length} modifications made`],
          },
        ],
      });
    }

    return signals;
  }

  /**
   * Get feedback statistics
   */
  getStats(filters?: { companyId?: string; patternId?: string }): FeedbackStats {
    let feedbackList = Array.from(this.feedbackStore.values());

    if (filters?.companyId) {
      feedbackList = feedbackList.filter((f) => f.userContext.companyId === filters.companyId);
    }

    const total = feedbackList.length;
    if (total === 0) {
      return this.emptyStats();
    }

    const accepted = feedbackList.filter((f) => f.feedbackType === FeedbackType.ACCEPTED).length;
    const modified = feedbackList.filter((f) => f.feedbackType === FeedbackType.MODIFIED).length;
    const rejected = feedbackList.filter((f) => f.feedbackType === FeedbackType.REJECTED).length;

    const totalModifications = feedbackList.reduce((sum, f) => sum + f.modifications.length, 0);

    // Count modification actions
    const actionCounts = new Map<ModificationAction, number>();
    feedbackList.forEach((f) => {
      f.modifications.forEach((m) => {
        actionCounts.set(m.action, (actionCounts.get(m.action) || 0) + 1);
      });
    });

    const topActions = Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Pattern performance
    const patternStats = this.calculatePatternPerformance(feedbackList);

    return {
      totalFeedback: total,
      acceptanceRate: accepted / total,
      modificationRate: modified / total,
      rejectionRate: rejected / total,
      averageModificationsPerSession: totalModifications / total,
      topModificationActions: topActions,
      patternPerformance: patternStats,
    };
  }

  /**
   * Get feedback for a specific session
   */
  getFeedbackBySession(sessionId: string): UserFeedback | undefined {
    return Array.from(this.feedbackStore.values()).find((f) => f.sessionId === sessionId);
  }

  /**
   * Get all feedback for a pattern
   */
  getFeedbackByPattern(patternId: string): UserFeedback[] {
    return Array.from(this.feedbackStore.values()).filter(
      (f) => this.extractPatternId(f.originalPrediction) === patternId,
    );
  }

  /**
   * Clear feedback (for testing)
   */
  clearFeedback(): void {
    this.feedbackStore.clear();
    this.sessionModifications.clear();
  }

  // Private helpers

  private generateId(): string {
    return `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractPatternId(prediction: StructurePrediction): string {
    // In production, this would extract from prediction metadata
    return prediction.moduleType || 'unknown';
  }

  private createBaseSignal(feedback: UserFeedback, patternId: string): LearningSignal {
    let signalType: LearningSignalType;
    let weight: number;

    switch (feedback.feedbackType) {
      case FeedbackType.ACCEPTED:
        signalType = LearningSignalType.POSITIVE_REINFORCEMENT;
        weight = 1.0;
        break;
      case FeedbackType.REJECTED:
        signalType = LearningSignalType.NEGATIVE_REINFORCEMENT;
        weight = -1.0;
        break;
      case FeedbackType.MODIFIED:
        signalType = LearningSignalType.PATTERN_CORRECTION;
        weight = 0.5;
        break;
      case FeedbackType.ALTERNATIVE_SELECTED:
        signalType = LearningSignalType.PATTERN_CORRECTION;
        weight = 0.3;
        break;
      default:
        signalType = LearningSignalType.PATTERN_CORRECTION;
        weight = 0.0;
    }

    return {
      signalType,
      weight,
      patternId,
      feedback,
      derivedInsights: [],
    };
  }

  private analyzeModifications(modifications: ModificationRecord[]): DerivedInsight[] {
    const insights: DerivedInsight[] = [];

    // Group by action type
    const byAction = new Map<ModificationAction, ModificationRecord[]>();
    modifications.forEach((m) => {
      const existing = byAction.get(m.action) || [];
      existing.push(m);
      byAction.set(m.action, existing);
    });

    // Analyze additions
    const additions = byAction.get(ModificationAction.ADD_FIELD) || [];
    if (additions.length >= 2) {
      insights.push({
        type: InsightType.COMMON_ADDITION,
        description: `User commonly adds fields (${additions.length} additions)`,
        confidence: Math.min(0.9, 0.5 + additions.length * 0.1),
        evidence: additions.map((a) => `Added: ${a.target}`),
      });
    }

    // Analyze removals
    const removals = byAction.get(ModificationAction.REMOVE_FIELD) || [];
    if (removals.length >= 2) {
      insights.push({
        type: InsightType.COMMON_REMOVAL,
        description: `User commonly removes fields (${removals.length} removals)`,
        confidence: Math.min(0.9, 0.5 + removals.length * 0.1),
        evidence: removals.map((r) => `Removed: ${r.target}`),
      });
    }

    // Analyze type changes
    const typeChanges = byAction.get(ModificationAction.CHANGE_TYPE) || [];
    if (typeChanges.length >= 1) {
      insights.push({
        type: InsightType.FIELD_TYPE_PREFERENCE,
        description: 'User has field type preferences',
        confidence: 0.7,
        evidence: typeChanges.map((t) => `${t.before} → ${t.after}`),
      });
    }

    return insights;
  }

  private isNewPatternCandidate(feedback: UserFeedback): boolean {
    // Significant modifications suggest a new pattern
    return (
      feedback.feedbackType === FeedbackType.REJECTED ||
      (feedback.feedbackType === FeedbackType.MODIFIED && feedback.modifications.length >= 5)
    );
  }

  private calculatePatternPerformance(
    feedbackList: UserFeedback[],
  ): { patternId: string; acceptanceRate: number }[] {
    const byPattern = new Map<string, UserFeedback[]>();

    feedbackList.forEach((f) => {
      const patternId = this.extractPatternId(f.originalPrediction);
      const existing = byPattern.get(patternId) || [];
      existing.push(f);
      byPattern.set(patternId, existing);
    });

    return Array.from(byPattern.entries()).map(([patternId, feedback]) => {
      const accepted = feedback.filter((f) => f.feedbackType === FeedbackType.ACCEPTED).length;
      return {
        patternId,
        acceptanceRate: accepted / feedback.length,
      };
    });
  }

  private emptyStats(): FeedbackStats {
    return {
      totalFeedback: 0,
      acceptanceRate: 0,
      modificationRate: 0,
      rejectionRate: 0,
      averageModificationsPerSession: 0,
      topModificationActions: [],
      patternPerformance: [],
    };
  }
}
