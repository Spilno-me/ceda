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
} from '../interfaces';

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
   * @param tenantContext - Optional tenant context for multi-tenant filtering
   */
  matchPattern(
    classification: IntentClassification,
    tenantContext?: TenantContext,
  ): PatternMatch | null {
    let bestMatch: PatternMatch | null = null;
    let highestScore = 0;

    for (const pattern of this.patterns.values()) {
      // Multi-tenant filtering: skip patterns that don't match the company context
      // Patterns without a company field are considered global and match all tenants
      if (tenantContext?.company && pattern.company && pattern.company !== tenantContext.company) {
        continue;
      }

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
}
