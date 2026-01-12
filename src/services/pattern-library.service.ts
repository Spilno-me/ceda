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
} from '../interfaces';
import { TenantEmbeddingContext } from './tenant-embedding.service';

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

    const score = totalWeight > 0 ? totalScore / totalWeight : 0;
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
}
