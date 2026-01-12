/**
 * CEDA-37: Abstraction Service
 *
 * Manages cross-domain learning through pattern abstraction.
 * Extracts common structures from patterns across domains,
 * suggests applicable abstractions for new patterns,
 * and ensures data anonymization for safety.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  AbstractPattern,
  AbstractStructure,
  DomainInstance,
  CrossDomainInsight,
  InsightEvidence,
  AbstractionSuggestion,
  ApplyAbstractionRequest,
  ApplyAbstractionResponse,
  AbstractionRules,
  CrossDomainSafetySettings,
  CrossDomainAuditEntry,
  Phase,
  Transition,
  Invariant,
  DEFAULT_ABSTRACTION_RULES,
  DEFAULT_SAFETY_SETTINGS,
  Pattern,
  PatternLevel,
  PatternStructure,
} from '../interfaces';
import { PatternLibraryService } from './pattern-library.service';
import { ObservationService } from './observation.service';

@Injectable()
export class AbstractionService {
  private readonly logger = new Logger(AbstractionService.name);
  private abstractions: Map<string, AbstractPattern> = new Map();
  private insights: Map<string, CrossDomainInsight> = new Map();
  private auditLog: CrossDomainAuditEntry[] = [];
  private rules: AbstractionRules = DEFAULT_ABSTRACTION_RULES;
  private safetySettings: CrossDomainSafetySettings = DEFAULT_SAFETY_SETTINGS;

  constructor(
    private readonly patternLibrary: PatternLibraryService,
    private readonly observationService: ObservationService,
  ) {}

  /**
   * Extract an abstraction from multiple patterns across domains
   */
  async extractAbstraction(patterns: Pattern[]): Promise<AbstractPattern> {
    if (patterns.length === 0) {
      throw new Error('Cannot extract abstraction from empty pattern list');
    }

    const commonStructure = this.findCommonStructure(patterns);
    const instances = patterns.map(p => this.createDomainInstance(p, commonStructure));
    const domains = [...new Set(patterns.map(p => p.company || p.domain || 'unknown'))];
    const confidence = this.calculateConfidence(patterns);

    const abstraction: AbstractPattern = {
      id: this.generateId('abs'),
      name: this.generateName(commonStructure),
      structure: commonStructure,
      instances,
      observationCount: patterns.length,
      domains,
      confidence,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.abstractions.set(abstraction.id, abstraction);

    this.addAuditEntry({
      action: 'abstraction_created',
      abstractionId: abstraction.id,
      sourceDomains: domains,
    });

    this.logger.log(`Created abstraction ${abstraction.id}: "${abstraction.name}" from ${patterns.length} patterns across ${domains.length} domains`);

    return abstraction;
  }

  /**
   * Suggest abstractions that could apply to a new pattern
   */
  async suggestAbstraction(newPattern: Pattern): Promise<AbstractionSuggestion[]> {
    const suggestions: AbstractionSuggestion[] = [];

    for (const abstraction of this.abstractions.values()) {
      const matchResult = this.matchAbstraction(abstraction, newPattern);
      if (matchResult.score > 0.3) {
        suggestions.push({
          abstraction,
          score: matchResult.score,
          matchedStructure: matchResult.matchedStructure,
          suggestedMapping: matchResult.suggestedMapping,
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  /**
   * Apply an abstraction to a new domain
   */
  async applyAbstraction(request: ApplyAbstractionRequest): Promise<ApplyAbstractionResponse> {
    const abstraction = this.abstractions.get(request.abstractionId);
    if (!abstraction) {
      return {
        success: false,
        abstractionId: request.abstractionId,
        domain: request.domain,
        instanceCreated: false,
        message: 'Abstraction not found',
      };
    }

    if (!this.isDomainAllowed(request.domain)) {
      return {
        success: false,
        abstractionId: request.abstractionId,
        domain: request.domain,
        instanceCreated: false,
        message: `Domain ${request.domain} is not allowed for cross-domain learning`,
      };
    }

    if (this.safetySettings.requireAdminApproval && !request.adminUserId) {
      return {
        success: false,
        abstractionId: request.abstractionId,
        domain: request.domain,
        instanceCreated: false,
        message: 'Admin approval required for cross-domain application',
      };
    }

    const existingInstance = abstraction.instances.find(i => i.domain === request.domain);
    if (existingInstance) {
      return {
        success: false,
        abstractionId: request.abstractionId,
        domain: request.domain,
        instanceCreated: false,
        message: 'Domain instance already exists for this abstraction',
      };
    }

    const newInstance: DomainInstance = {
      domain: request.domain,
      patternId: `${request.domain}-${abstraction.id}`,
      mapping: request.mapping,
    };

    abstraction.instances.push(newInstance);
    if (!abstraction.domains.includes(request.domain)) {
      abstraction.domains.push(request.domain);
    }
    abstraction.updatedAt = new Date();

    this.addAuditEntry({
      action: 'abstraction_applied',
      abstractionId: abstraction.id,
      sourceDomains: abstraction.domains.filter(d => d !== request.domain),
      targetDomain: request.domain,
      userId: request.adminUserId,
    });

    this.logger.log(`Applied abstraction ${abstraction.id} to domain ${request.domain}`);

    return {
      success: true,
      abstractionId: request.abstractionId,
      domain: request.domain,
      instanceCreated: true,
    };
  }

  /**
   * Anonymize data to remove company-specific information
   * Ensures no raw data leakage in cross-domain learning
   */
  anonymize(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.anonymizeString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.anonymize(item));
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        const anonymizedKey = this.anonymizeFieldName(key);
        result[anonymizedKey] = this.anonymize(value);
      }
      return result;
    }

    return data;
  }

  /**
   * Get all abstractions
   */
  getAllAbstractions(): AbstractPattern[] {
    return Array.from(this.abstractions.values());
  }

  /**
   * Get abstraction by ID
   */
  getAbstraction(id: string): AbstractPattern | null {
    return this.abstractions.get(id) || null;
  }

  /**
   * Get instances for an abstraction
   */
  getAbstractionInstances(abstractionId: string): DomainInstance[] {
    const abstraction = this.abstractions.get(abstractionId);
    return abstraction?.instances || [];
  }

  /**
   * Generate cross-domain insights from abstractions
   */
  async generateInsights(): Promise<CrossDomainInsight[]> {
    const newInsights: CrossDomainInsight[] = [];

    for (const abstraction of this.abstractions.values()) {
      if (abstraction.domains.length < 2) {
        continue;
      }

      const evidence = await this.gatherEvidence(abstraction);
      if (evidence.length < 2) {
        continue;
      }

      const insight = this.createInsight(abstraction, evidence);
      if (insight) {
        this.insights.set(insight.id, insight);
        newInsights.push(insight);

        this.addAuditEntry({
          action: 'insight_generated',
          insightId: insight.id,
          abstractionId: abstraction.id,
          sourceDomains: abstraction.domains,
        });
      }
    }

    this.logger.log(`Generated ${newInsights.length} new cross-domain insights`);
    return newInsights;
  }

  /**
   * Get all cross-domain insights
   */
  getAllInsights(): CrossDomainInsight[] {
    return Array.from(this.insights.values());
  }

  /**
   * Get insight by ID
   */
  getInsight(id: string): CrossDomainInsight | null {
    return this.insights.get(id) || null;
  }

  /**
   * Approve a cross-domain insight (admin action)
   */
  approveInsight(insightId: string, adminUserId: string): boolean {
    const insight = this.insights.get(insightId);
    if (!insight) {
      return false;
    }

    insight.approved = true;
    insight.approvedBy = adminUserId;
    insight.approvedAt = new Date();

    this.addAuditEntry({
      action: 'insight_approved',
      insightId,
      abstractionId: insight.abstraction.id,
      sourceDomains: insight.applicableDomains,
      userId: adminUserId,
    });

    this.logger.log(`Insight ${insightId} approved by ${adminUserId}`);
    return true;
  }

  /**
   * Get audit log entries
   */
  getAuditLog(limit?: number): CrossDomainAuditEntry[] {
    const entries = [...this.auditLog].reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  /**
   * Update safety settings
   */
  updateSafetySettings(settings: Partial<CrossDomainSafetySettings>): void {
    this.safetySettings = { ...this.safetySettings, ...settings };
    this.logger.log('Safety settings updated');
  }

  /**
   * Get current safety settings
   */
  getSafetySettings(): CrossDomainSafetySettings {
    return { ...this.safetySettings };
  }

  /**
   * Update abstraction rules
   */
  updateRules(rules: Partial<AbstractionRules>): void {
    if (rules.entities) {
      this.rules.entities = [...this.rules.entities, ...rules.entities];
    }
    if (rules.fields) {
      this.rules.fields = [...this.rules.fields, ...rules.fields];
    }
    if (rules.states) {
      this.rules.states = [...this.rules.states, ...rules.states];
    }
    this.logger.log('Abstraction rules updated');
  }

  /**
   * Get current abstraction rules
   */
  getRules(): AbstractionRules {
    return { ...this.rules };
  }

  /**
   * Find common structure across patterns
   */
  private findCommonStructure(patterns: Pattern[]): AbstractStructure {
    const phases: Phase[] = [];
    const transitions: Transition[] = [];
    const invariants: Invariant[] = [];

    const workflowPhases = new Map<string, number>();
    for (const pattern of patterns) {
      const workflows = pattern.structure?.workflows || [];
      for (let i = 0; i < workflows.length; i++) {
        const abstractPhase = this.abstractState(workflows[i]);
        const count = workflowPhases.get(abstractPhase) || 0;
        workflowPhases.set(abstractPhase, count + 1);
      }
    }

    const threshold = Math.ceil(patterns.length * 0.5);
    let order = 1;
    for (const [phaseName, count] of workflowPhases) {
      if (count >= threshold) {
        phases.push({
          name: phaseName,
          order: order++,
        });
      }
    }

    for (let i = 0; i < phases.length - 1; i++) {
      transitions.push({
        from: phases[i].name,
        to: phases[i + 1].name,
      });
    }

    const sectionCounts = new Map<string, number>();
    for (const pattern of patterns) {
      const sections = pattern.structure?.sections || [];
      for (const section of sections) {
        const abstractName = this.abstractEntity(section.name);
        const count = sectionCounts.get(abstractName) || 0;
        sectionCounts.set(abstractName, count + 1);
      }
    }

    for (const [sectionName, count] of sectionCounts) {
      if (count >= threshold) {
        invariants.push({
          name: `has_${sectionName.toLowerCase().replace(/\s+/g, '_')}`,
          description: `Must have ${sectionName} section`,
        });
      }
    }

    return { phases, transitions, invariants };
  }

  /**
   * Create a domain instance mapping for a pattern
   */
  private createDomainInstance(pattern: Pattern, structure: AbstractStructure): DomainInstance {
    const mapping: Record<string, string> = {};

    const sections = pattern.structure?.sections || [];
    for (const section of sections) {
      const abstractName = this.abstractEntity(section.name);
      if (abstractName !== section.name) {
        mapping[abstractName] = section.name;
      }

      for (const fieldType of section.fieldTypes) {
        const abstractField = this.abstractField(fieldType);
        if (abstractField !== fieldType) {
          mapping[abstractField] = fieldType;
        }
      }
    }

    const workflows = pattern.structure?.workflows || [];
    for (const workflow of workflows) {
      const abstractState = this.abstractState(workflow);
      if (abstractState !== workflow) {
        mapping[abstractState] = workflow;
      }
    }

    return {
      domain: pattern.company || pattern.domain || 'unknown',
      patternId: pattern.id,
      mapping,
    };
  }

  /**
   * Match an abstraction against a pattern
   */
  private matchAbstraction(
    abstraction: AbstractPattern,
    pattern: Pattern,
  ): { score: number; matchedStructure: string[]; suggestedMapping: Record<string, string> } {
    const matchedStructure: string[] = [];
    const suggestedMapping: Record<string, string> = {};
    let matchCount = 0;
    let totalChecks = 0;

    for (const phase of abstraction.structure.phases) {
      totalChecks++;
      const workflows = pattern.structure?.workflows || [];
      for (const workflow of workflows) {
        const abstractWorkflow = this.abstractState(workflow);
        if (abstractWorkflow === phase.name) {
          matchCount++;
          matchedStructure.push(`phase:${phase.name}`);
          suggestedMapping[phase.name] = workflow;
          break;
        }
      }
    }

    for (const invariant of abstraction.structure.invariants) {
      totalChecks++;
      const sections = pattern.structure?.sections || [];
      for (const section of sections) {
        const abstractSection = this.abstractEntity(section.name);
        const invariantSection = invariant.name.replace('has_', '').replace(/_/g, ' ');
        if (abstractSection.toLowerCase().includes(invariantSection.toLowerCase())) {
          matchCount++;
          matchedStructure.push(`invariant:${invariant.name}`);
          break;
        }
      }
    }

    const score = totalChecks > 0 ? matchCount / totalChecks : 0;

    return { score, matchedStructure, suggestedMapping };
  }

  /**
   * Calculate confidence score for an abstraction
   */
  private calculateConfidence(patterns: Pattern[]): number {
    if (patterns.length === 0) return 0;

    let totalConfidence = 0;
    for (const pattern of patterns) {
      const patternConfidence = pattern.confidence?.base || 0.5;
      totalConfidence += patternConfidence;
    }

    const avgConfidence = totalConfidence / patterns.length;
    const domainBonus = Math.min(0.2, (new Set(patterns.map(p => p.company || p.domain)).size - 1) * 0.1);

    return Math.min(1.0, avgConfidence + domainBonus);
  }

  /**
   * Generate a name for an abstraction based on its structure
   */
  private generateName(structure: AbstractStructure): string {
    const phaseNames = structure.phases.map(p => p.name);

    if (phaseNames.includes('pending') && phaseNames.includes('processing') && phaseNames.includes('done')) {
      return 'Stateful Operation Workflow';
    }

    if (phaseNames.includes('draft') && phaseNames.includes('review')) {
      return 'Review Workflow';
    }

    if (structure.invariants.length > 0) {
      const mainInvariant = structure.invariants[0].name.replace('has_', '').replace(/_/g, ' ');
      return `${mainInvariant} Pattern`;
    }

    return 'Abstract Pattern';
  }

  /**
   * Abstract an entity name using rules
   */
  private abstractEntity(name: string): string {
    for (const rule of this.rules.entities) {
      if (name.toLowerCase().includes(rule.concrete.toLowerCase())) {
        return rule.abstract;
      }
    }
    return name;
  }

  /**
   * Abstract a field name using rules
   */
  private abstractField(field: string): string {
    for (const rule of this.rules.fields) {
      if (field.toLowerCase() === rule.concrete.toLowerCase()) {
        return rule.abstract;
      }
    }
    return field;
  }

  /**
   * Abstract a state name using rules
   */
  private abstractState(state: string): string {
    for (const rule of this.rules.states) {
      if (state.toLowerCase() === rule.concrete.toLowerCase()) {
        return rule.abstract;
      }
    }
    return state;
  }

  /**
   * Anonymize a string value
   */
  private anonymizeString(value: string): string {
    let result = value;

    const companyPatterns = [
      /goprint/gi,
      /disrupt/gi,
      /spilno/gi,
      /\b[A-Z][a-z]+\s+(Inc|LLC|Ltd|Corp|Company)\b/g,
    ];

    for (const pattern of companyPatterns) {
      result = result.replace(pattern, '[COMPANY]');
    }

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    result = result.replace(emailPattern, '[EMAIL]');

    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    result = result.replace(phonePattern, '[PHONE]');

    return result;
  }

  /**
   * Anonymize a field name
   */
  private anonymizeFieldName(name: string): string {
    const companySpecificFields = [
      'companyId',
      'companyName',
      'organizationId',
      'tenantId',
      'clientId',
      'customerId',
    ];

    if (companySpecificFields.includes(name)) {
      return 'entityId';
    }

    return this.abstractField(name);
  }

  /**
   * Check if a domain is allowed for cross-domain learning
   */
  private isDomainAllowed(domain: string): boolean {
    if (this.safetySettings.disabledDomains.includes(domain)) {
      return false;
    }

    if (this.safetySettings.allowedDomains.includes('*')) {
      return true;
    }

    return this.safetySettings.allowedDomains.includes(domain);
  }

  /**
   * Gather evidence for an abstraction from observations
   */
  private async gatherEvidence(abstraction: AbstractPattern): Promise<InsightEvidence[]> {
    const evidence: InsightEvidence[] = [];

    for (const instance of abstraction.instances) {
      const stats = await this.observationService.getPatternStats(instance.patternId);
      if (stats.totalObservations > 0) {
        evidence.push({
          patternId: instance.patternId,
          domain: instance.domain,
          successRate: stats.acceptanceRate,
        });
      }
    }

    return evidence;
  }

  /**
   * Create an insight from abstraction and evidence
   */
  private createInsight(
    abstraction: AbstractPattern,
    evidence: InsightEvidence[],
  ): CrossDomainInsight | null {
    if (evidence.length < 2) {
      return null;
    }

    const avgSuccessRate = evidence.reduce((sum, e) => sum + e.successRate, 0) / evidence.length;
    const domains = evidence.map(e => e.domain);

    let insightText: string;
    if (avgSuccessRate > 0.8) {
      insightText = `Patterns following "${abstraction.name}" structure show ${Math.round(avgSuccessRate * 100)}% success rate across ${domains.join(', ')} domains`;
    } else if (avgSuccessRate > 0.5) {
      insightText = `"${abstraction.name}" pattern shows moderate success (${Math.round(avgSuccessRate * 100)}%) - consider refinement`;
    } else {
      insightText = `"${abstraction.name}" pattern may need review - success rate is ${Math.round(avgSuccessRate * 100)}%`;
    }

    return {
      id: this.generateId('insight'),
      abstraction,
      insight: insightText,
      applicableDomains: domains,
      evidence,
      requiresApproval: this.safetySettings.requireAdminApproval,
      approved: false,
      createdAt: new Date(),
    };
  }

  /**
   * Add an audit entry
   */
  private addAuditEntry(
    entry: Omit<CrossDomainAuditEntry, 'id' | 'timestamp'>,
  ): void {
    if (!this.safetySettings.auditEnabled) {
      return;
    }

    this.auditLog.push({
      ...entry,
      id: this.generateId('audit'),
      timestamp: new Date(),
    });
  }

  /**
   * Generate a unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all data (for testing)
   */
  clearAll(): void {
    this.abstractions.clear();
    this.insights.clear();
    this.auditLog = [];
  }
}
