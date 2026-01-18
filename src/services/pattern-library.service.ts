import { Injectable } from '@nestjs/common';
import {
  Pattern,
  PatternCategory,
  PatternMatch,
  PatternStructure,
  ApplicabilityRule,
  IntentClassification,
  IntentType,
  TenantContext,
  PatternScope,
  PatternConfidence,
} from '../interfaces';
import { TenantEmbeddingContext } from './tenant-embedding.service';
import { upstashRedis, PatternAdaptiveState } from './upstash-redis.service';

/**
 * User-first pattern query context
 * USER is the doorway - all pattern access flows through user context
 */
export interface UserPatternQuery {
  /** Required: User ID - the primary doorway for pattern access */
  user: string;
  /** Optional: Company filter for narrowing results */
  company?: string;
  /** Optional: Project filter for narrowing results */
  project?: string;
}

@Injectable()
export class PatternLibraryService {
  private patterns: Map<string, Pattern> = new Map();

  /**
   * CEDA is domain-agnostic. Patterns are injected by the application layer.
   * For HSE: load HSE patterns externally
   * For HR: load HR patterns externally
   * etc.
   */
  constructor() {
    // No default patterns - CEDA is domain-agnostic
    // Use loadPatterns() or registerPattern() to inject domain-specific patterns
  }

  /**
   * Load multiple patterns at once (bulk registration)
   * Called by application layer to inject domain-specific patterns
   */
  loadPatterns(patterns: Pattern[]): void {
    for (const pattern of patterns) {
      this.registerPattern(pattern);
    }
  }

  /**
   * Clear all patterns (useful for testing or domain switching)
   */
  clearPatterns(): void {
    this.patterns.clear();
  }

  /**
   * Register a pattern in the library
   */
  registerPattern(pattern: Pattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): Pattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get all patterns in a category
   */
  getPatternsByCategory(category: PatternCategory): Pattern[] {
    return Array.from(this.patterns.values()).filter(
      (p) => p.category === category,
    );
  }

  /**
   * Find best matching pattern for a given intent classification
   * @param classification - The intent classification to match against
   * @param _tenantContext - @deprecated Use getPatternsWithContext for AI-native multi-tenancy
   *
   * CEDA-20: SQL-style company filtering removed.
   * For AI-native multi-tenancy, use getPatternsWithContext() which ranks
   * patterns by embedding similarity (soft ranking) instead of hard filtering.
   */
  matchPattern(
    classification: IntentClassification,
    _tenantContext?: TenantContext,
  ): PatternMatch | null {
    let bestMatch: PatternMatch | null = null;
    let highestScore = 0;

    for (const pattern of this.patterns.values()) {
      // CEDA-20: No company filtering - AI-native uses soft ranking via embeddings
      // All patterns are evaluated; ranking is handled by embedding similarity

      const { score, matchedRules } = this.evaluatePattern(
        pattern,
        classification,
      );
      if (score > highestScore) {
        highestScore = score;
        bestMatch = { pattern, score, matchedRules };
      }
    }

    return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
  }

  /**
   * Evaluate how well a pattern matches the classification
   * CEDA-32: Applies confidence decay to the final score
   */
  private evaluatePattern(
    pattern: Pattern,
    classification: IntentClassification,
  ): { score: number; matchedRules: string[] } {
    const matchedRules: string[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const rule of pattern.applicabilityRules) {
      const ruleScore = this.evaluateRule(rule, classification);
      if (ruleScore > 0) {
        matchedRules.push(rule.field);
      }
      totalScore += ruleScore * rule.weight;
      totalWeight += rule.weight;
    }

    const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    const confidenceMultiplier = this.currentConfidence(pattern);
    const score = baseScore * confidenceMultiplier;
    
    return { score, matchedRules };
  }

  /**
   * Evaluate a single applicability rule
   */
  private evaluateRule(
    rule: ApplicabilityRule,
    classification: IntentClassification,
  ): number {
    const fieldValue = this.getFieldValue(rule.field, classification);
    if (fieldValue === undefined || fieldValue === null) {
      return 0;
    }

    const stringValue = String(fieldValue).toLowerCase();
    const ruleValue = rule.value.toLowerCase();

    switch (rule.operator) {
      case 'equals':
        return stringValue === ruleValue ? 1 : 0;
      case 'contains':
        return stringValue.includes(ruleValue) ? 1 : 0;
      case 'matches':
        try {
          const regex = new RegExp(ruleValue, 'i');
          return regex.test(stringValue) ? 1 : 0;
        } catch {
          return 0;
        }
      default:
        return 0;
    }
  }

  /**
   * Get field value from classification for rule evaluation
   */
  private getFieldValue(
    field: string,
    classification: IntentClassification,
  ): string | undefined {
    switch (field) {
      case 'intent':
        return classification.intent;
      case 'domain':
        return classification.domain;
      case 'confidence':
        return String(classification.confidence);
      case 'entities':
        return classification.entities.join(' ');
      default:
        return undefined;
    }
  }

  /**
   * Get the structure template for a pattern
   */
  getPatternStructure(patternId: string): PatternStructure | undefined {
    const pattern = this.patterns.get(patternId);
    return pattern?.structure;
  }

  /**
   * Get all registered patterns
   */
  getAllPatterns(): Pattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Check if any patterns are loaded
   */
  hasPatterns(): boolean {
    return this.patterns.size > 0;
  }

  /**
   * Get pattern count
   */
  getPatternCount(): number {
    return this.patterns.size;
  }

  /**
   * Fuse query embedding with tenant embedding using alpha-weighted fusion
   * α-weighted fusion: α * query + (1-α) * tenant
   * @param queryEmbedding - The query embedding vector
   * @param tenantEmbedding - The tenant context embedding vector
   * @param alpha - Weight for query embedding (default: 0.7 = query-dominant)
   */
  fuseEmbeddings(
    queryEmbedding: number[],
    tenantEmbedding: number[],
    alpha: number = 0.7,
  ): number[] {
    if (queryEmbedding.length !== tenantEmbedding.length) {
      console.warn('[PatternLibraryService] Embedding dimension mismatch, returning query embedding');
      return queryEmbedding;
    }
    return queryEmbedding.map((q, i) => alpha * q + (1 - alpha) * tenantEmbedding[i]);
  }

  /**
   * Get patterns with context-aware retrieval using embedding fusion
   * This is the AI-native approach: soft ranking via embedding similarity instead of SQL filtering
   * @param query - The search query text
   * @param tenantContext - The tenant embedding context for fusion
   * @param embeddingService - Service to generate query embeddings
   * @param vectorStore - Vector store for similarity search (must have searchByVector method)
   */
  async getPatternsWithContext(
    query: string,
    tenantContext: TenantEmbeddingContext,
    embeddingService: { generateEmbedding: (text: string) => Promise<number[] | null> },
    vectorStore: { searchByVector: (vector: number[], limit: number) => Promise<{ pattern: Pattern; score: number }[]> },
  ): Promise<Pattern[]> {
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      console.warn('[PatternLibraryService] Failed to generate query embedding, falling back to all patterns');
      return this.getAllPatterns();
    }

    // α-weighted fusion: α * query + (1-α) * tenant
    // α = 0.7 → query-dominant (what they asked)
    const fusedEmbedding = this.fuseEmbeddings(
      queryEmbedding,
      tenantContext.embedding,
      0.7,
    );

    console.log(`[PatternLibraryService] Context-aware retrieval for tenant: ${tenantContext.tenantId}`);
    console.log(`[PatternLibraryService] Fused embedding dimension: ${fusedEmbedding.length}`);

    // Use the fused embedding for vector search - NO SQL filter, soft ranking only
    const results = await vectorStore.searchByVector(fusedEmbedding, 20);

    return results.map(r => r.pattern);
  }

  /**
   * CEDA-25: User-first pattern isolation
   * Get patterns accessible to a user with optional company/project filters
   * 
   * USER is the doorway - all pattern access flows through user context.
   * Patterns are returned based on scope hierarchy:
   * 1. User-scoped patterns (user_id matches)
   * 2. Project-scoped patterns (if project filter provided)
   * 3. Company-scoped patterns (if company filter provided)
   * 4. Global patterns (always included)
   * 
   * @param query - User-first query with required user and optional filters
   * @returns Patterns accessible to the user, filtered by company/project if provided
   */
  getPatternsForUser(query: UserPatternQuery): Pattern[] {
    const { user, company, project } = query;
    const allPatterns = this.getAllPatterns();

    return allPatterns.filter((pattern) => {
      const scope = pattern.scope || PatternScope.GLOBAL;

      switch (scope) {
        case PatternScope.USER:
          // User-scoped patterns: only visible to the owning user
          return pattern.user_id === user;

        case PatternScope.PROJECT:
          // Project-scoped patterns: visible if user is in the project
          // If project filter is provided, must match
          if (project) {
            return pattern.project === project;
          }
          // Without project filter, include if user has access (user_id matches or no user_id)
          return !pattern.user_id || pattern.user_id === user;

        case PatternScope.COMPANY:
          // Company-scoped patterns: visible if user is in the company
          // If company filter is provided, must match
          if (company) {
            return pattern.company === company;
          }
          // Without company filter, include if user has access
          return !pattern.user_id || pattern.user_id === user;

        case PatternScope.GLOBAL:
          // Global patterns: always visible to all users
          return true;

        default:
          // Default to global behavior for backward compatibility
          return true;
      }
    });
  }

  /**
   * CEDA-25: Check if a pattern is accessible to a user
   * @param patternId - The pattern ID to check
   * @param query - User-first query context
   * @returns true if the user can access the pattern
   */
  isPatternAccessibleToUser(patternId: string, query: UserPatternQuery): boolean {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return false;
    }

    const accessiblePatterns = this.getPatternsForUser(query);
    return accessiblePatterns.some((p) => p.id === patternId);
  }

  /**
   * CEDA-25: Get a single pattern by ID with user access check
   * @param patternId - The pattern ID to retrieve
   * @param query - User-first query context
   * @returns The pattern if accessible, undefined otherwise
   */
  getPatternForUser(patternId: string, query: UserPatternQuery): Pattern | undefined {
    if (!this.isPatternAccessibleToUser(patternId, query)) {
      return undefined;
    }
    return this.getPattern(patternId);
  }

  /**
   * CEDA-32: Calculate current confidence for a pattern with decay applied
   * CEDA-67: Uses Redis for adaptive state persistence when available
   *
   * Patterns decay without grounding, boost with successful executions
   *
   * Formula: max(0.1, base - decay + grounded)
   * - decay = daysSinceGrounding * decayRate
   * - grounded = min(groundingCount * 0.05, 0.3) (max 30% boost)
   *
   * @param pattern - The pattern to calculate confidence for
   * @returns Current confidence score (0.1 - 1.0)
   */
  currentConfidence(pattern: Pattern): number {
    const confidence = pattern.confidence;

    if (!confidence) {
      return 1.0;
    }

    const { base, lastGrounded, groundingCount, decayRate } = confidence;

    let daysSinceGrounding = 0;
    if (lastGrounded) {
      const now = new Date();
      const lastGroundedDate = new Date(lastGrounded);
      const diffMs = now.getTime() - lastGroundedDate.getTime();
      daysSinceGrounding = diffMs / (1000 * 60 * 60 * 24);
    }

    const decay = daysSinceGrounding * decayRate;
    const groundedBoost = Math.min(groundingCount * 0.05, 0.3);

    return Math.max(0.1, base - decay + groundedBoost);
  }

  /**
   * CEDA-67: Get pattern confidence with Redis-backed adaptive state
   * Merges in-memory pattern confidence with persistent adaptive state
   */
  async getCurrentConfidenceAsync(pattern: Pattern): Promise<number> {
    // Try Redis first for adaptive state
    if (upstashRedis.isEnabled()) {
      const adaptiveState = await upstashRedis.getPatternState(pattern.id);
      if (adaptiveState) {
        // Use Redis weight * decay factor as confidence
        return Math.max(0.1, adaptiveState.weight * adaptiveState.decayFactor);
      }
    }

    // Fallback to in-memory confidence calculation
    return this.currentConfidence(pattern);
  }

  /**
   * CEDA-32: Get pattern confidence with decay applied
   * @param patternId - The pattern ID to get confidence for
   * @returns Current confidence score or null if pattern not found
   */
  getPatternConfidence(patternId: string): number | null {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return null;
    }
    return this.currentConfidence(pattern);
  }

  /**
   * CEDA-32: Update pattern grounding data after successful execution
   * CEDA-67: Also persists to Redis for cross-instance state
   *
   * @param patternId - The pattern ID to update
   * @param success - Whether the execution was successful
   * @returns Updated pattern or null if not found
   */
  groundPattern(patternId: string, success: boolean): Pattern | null {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return null;
    }

    const now = new Date();
    const currentConfidence = pattern.confidence || this.createDefaultConfidence();

    if (success) {
      const updatedPattern: Pattern = {
        ...pattern,
        confidence: {
          ...currentConfidence,
          lastGrounded: now,
          groundingCount: currentConfidence.groundingCount + 1,
        },
      };
      this.registerPattern(updatedPattern);

      // CEDA-67: Persist to Redis if available (fire and forget)
      if (upstashRedis.isEnabled()) {
        this.persistGroundingToRedis(pattern, success).catch((err) => {
          console.warn('[PatternLibraryService] Failed to persist grounding to Redis:', err);
        });
      }

      return updatedPattern;
    }

    return pattern;
  }

  /**
   * CEDA-67: Persist grounding event to Redis adaptive state
   * Updates weight (effectiveness score) based on success/failure
   */
  private async persistGroundingToRedis(pattern: Pattern, success: boolean): Promise<void> {
    const patternId = pattern.id;

    // Increment feedback count
    await upstashRedis.incrementFeedback(patternId, 1);

    // Adjust weight based on outcome
    const currentState = await upstashRedis.getPatternState(patternId);
    const currentWeight = currentState?.weight ?? 0.5;

    // Adaptive weight: success increases, failure decreases
    const weightDelta = success ? 0.05 : -0.1;
    const newWeight = Math.max(0.1, Math.min(1.0, currentWeight + weightDelta));

    await upstashRedis.updateWeight(patternId, newWeight);

    // Initialize or update full state if not exists
    if (!currentState) {
      const initialState: PatternAdaptiveState = {
        patternId,
        weight: newWeight,
        feedbackCount: 1,
        lastUsed: new Date().toISOString(),
        decayFactor: 1.0,
        level: 'user',
        graduationStatus: 'active',
        org: pattern.company || 'unknown',
        project: pattern.project || 'default',
        user: pattern.user_id || 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await upstashRedis.setPatternState(initialState);
    }
  }

  /**
   * CEDA-32: Create default confidence for patterns without grounding data
   */
  private createDefaultConfidence(): PatternConfidence {
    return {
      base: 1.0,
      lastGrounded: null,
      groundingCount: 0,
      decayRate: 0.01,
    };
  }

  /**
   * CEDA-32: Initialize confidence for a pattern if not already set
   * @param patternId - The pattern ID to initialize
   * @param baseConfidence - Initial base confidence (default: 1.0)
   * @returns Updated pattern or null if not found
   */
  initializePatternConfidence(patternId: string, baseConfidence: number = 1.0): Pattern | null {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return null;
    }

    if (pattern.confidence) {
      return pattern;
    }

    const updatedPattern: Pattern = {
      ...pattern,
      confidence: {
        base: baseConfidence,
        lastGrounded: null,
        groundingCount: 0,
        decayRate: 0.01,
      },
    };
    this.registerPattern(updatedPattern);
    return updatedPattern;
  }
}
