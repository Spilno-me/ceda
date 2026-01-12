import { Injectable, Logger } from '@nestjs/common';
import {
  Antipattern,
  SessionObservation,
  StoredObservation,
  AntipatternMatch,
  DetectRequest,
  DetectResponse,
  LearnRequest,
  LearnResponse,
  LearningOutcome,
} from '../interfaces';

/**
 * AntipatternService - Antipattern observation and learning for CEDA
 *
 * Handles:
 * - Receiving session observations from Herald
 * - Detecting antipatterns in behavior
 * - Learning from outcomes to improve detection
 */
@Injectable()
export class AntipatternService {
  private readonly logger = new Logger(AntipatternService.name);
  private antipatterns: Map<string, Antipattern> = new Map();
  private observations: Map<string, StoredObservation> = new Map();

  /**
   * Load antipatterns into the service
   */
  loadAntipatterns(antipatterns: Antipattern[]): void {
    for (const antipattern of antipatterns) {
      this.antipatterns.set(antipattern.id, { ...antipattern });
    }
    this.logger.log(`Loaded ${antipatterns.length} antipatterns`);
  }

  /**
   * Get all loaded antipatterns
   */
  getAntipatterns(): Antipattern[] {
    return Array.from(this.antipatterns.values());
  }

  /**
   * Get antipattern by ID
   */
  getAntipattern(id: string): Antipattern | undefined {
    return this.antipatterns.get(id);
  }

  /**
   * Get count of loaded antipatterns
   */
  getAntipatternCount(): number {
    return this.antipatterns.size;
  }

  /**
   * Record a session observation from Herald
   */
  observe(observation: SessionObservation): StoredObservation {
    const id = this.generateId();
    const stored: StoredObservation = {
      ...observation,
      id,
      timestamp: new Date(observation.timestamp),
      detectedAntipatterns: [],
    };

    this.observations.set(id, stored);
    this.logger.log(`Recorded observation ${id} for session ${observation.sessionId}`);

    return stored;
  }

  /**
   * Get observation by ID
   */
  getObservation(id: string): StoredObservation | undefined {
    return this.observations.get(id);
  }

  /**
   * Get observations for a session
   */
  getObservationsBySession(sessionId: string): StoredObservation[] {
    return Array.from(this.observations.values()).filter(
      (obs) => obs.sessionId === sessionId,
    );
  }

  /**
   * Detect antipatterns in behavior
   */
  detect(request: DetectRequest): DetectResponse {
    const matches: AntipatternMatch[] = [];
    const behaviorLower = request.behavior.toLowerCase();
    const contextLower = (request.context || '').toLowerCase();

    for (const antipattern of this.antipatterns.values()) {
      const match = this.matchAntipattern(antipattern, behaviorLower, contextLower);
      if (match) {
        matches.push(match);
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    this.logger.log(
      `Detected ${matches.length} antipattern(s) for behavior: "${request.behavior.substring(0, 50)}..."`,
    );

    return {
      matches,
      analyzed: true,
      timestamp: new Date(),
    };
  }

  /**
   * Learn from outcome - update antipattern confidence
   */
  learn(request: LearnRequest): LearnResponse {
    const antipattern = this.antipatterns.get(request.antipatternId);

    if (!antipattern) {
      this.logger.warn(`Antipattern not found: ${request.antipatternId}`);
      return {
        updated: false,
        antipatternId: request.antipatternId,
        newConfidence: 0,
        outcome: request.outcome,
      };
    }

    const oldConfidence = antipattern.confidence;
    let newConfidence: number;

    if (request.outcome === LearningOutcome.ANTIPATTERN_CONFIRMED) {
      newConfidence = Math.min(1.0, oldConfidence + 0.05);
      if (!antipattern.source_sessions.includes(request.sessionId)) {
        antipattern.source_sessions.push(request.sessionId);
      }
    } else {
      newConfidence = Math.max(0.1, oldConfidence - 0.05);
    }

    antipattern.confidence = newConfidence;
    this.antipatterns.set(request.antipatternId, antipattern);

    this.logger.log(
      `Updated antipattern ${request.antipatternId}: confidence ${oldConfidence.toFixed(2)} -> ${newConfidence.toFixed(2)} (${request.outcome})`,
    );

    return {
      updated: true,
      antipatternId: request.antipatternId,
      newConfidence,
      outcome: request.outcome,
    };
  }

  /**
   * Get observation statistics
   */
  getStats(): {
    totalObservations: number;
    totalAntipatterns: number;
    confirmedCount: number;
    paradigmCandidateCount: number;
  } {
    const observations = Array.from(this.observations.values());
    const confirmed = observations.filter(
      (o) => o.learningOutcome === LearningOutcome.ANTIPATTERN_CONFIRMED,
    ).length;
    const paradigmCandidates = observations.filter(
      (o) => o.learningOutcome === LearningOutcome.PARADIGM_CANDIDATE,
    ).length;

    return {
      totalObservations: observations.length,
      totalAntipatterns: this.antipatterns.size,
      confirmedCount: confirmed,
      paradigmCandidateCount: paradigmCandidates,
    };
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.antipatterns.clear();
    this.observations.clear();
  }

  private generateId(): string {
    return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private matchAntipattern(
    antipattern: Antipattern,
    behaviorLower: string,
    contextLower: string,
  ): AntipatternMatch | null {
    const matchedSignals: string[] = [];
    let score = 0;

    const signalKeywords = this.extractKeywords(antipattern.signal);
    const contextKeywords = this.extractKeywords(antipattern.context);

    for (const keyword of signalKeywords) {
      if (behaviorLower.includes(keyword) || contextLower.includes(keyword)) {
        matchedSignals.push(keyword);
        score += 0.3;
      }
    }

    for (const keyword of contextKeywords) {
      if (behaviorLower.includes(keyword) || contextLower.includes(keyword)) {
        if (!matchedSignals.includes(keyword)) {
          matchedSignals.push(keyword);
          score += 0.15;
        }
      }
    }

    if (matchedSignals.length === 0) {
      return null;
    }

    const confidence = Math.min(1.0, score * antipattern.confidence);

    if (confidence < 0.2) {
      return null;
    }

    return {
      antipattern,
      confidence,
      matchedSignals,
      suggestedEscape: antipattern.escape,
    };
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
      'because', 'until', 'while', 'that', 'which', 'who', 'whom', 'this',
      'these', 'those', 'am', 'its', 'it', 'they', 'them', 'their', 'what',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));
  }
}
