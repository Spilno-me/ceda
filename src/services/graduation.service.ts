/**
 * CEDA-36: Graduation Service
 * CEDA-67: Redis-backed graduation state persistence
 *
 * Manages pattern graduation from observations to shared patterns.
 * Patterns evolve through levels based on usage and acceptance criteria.
 *
 * Graduation status is persisted to Redis for cross-instance consistency.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Pattern,
  PatternLevel,
  PatternStructure,
  PatternSection,
  GraduationResult,
  GraduationStats,
  GraduationCandidate,
  GraduationStatus,
  ApproveGraduationResponse,
  DEFAULT_GRADUATION_CRITERIA,
  Observation,
} from '../interfaces';
import { PatternLibraryService } from './pattern-library.service';
import { ObservationService } from './observation.service';
import { upstashRedis, PatternAdaptiveState } from './upstash-redis.service';

/**
 * GraduationService - Pattern graduation management
 *
 * CEDA-95: Updated to support 6-level graduation model:
 * - Level 0 (Observation): Raw herald_reflect capture
 * - Level 1 (User): Validated for a single user (3+ obs, 70% helpful)
 * - Level 2 (Project): Validated across users in a project (3+ users, 80% helpful)
 * - Level 3 (Org): Validated across projects in an org (3+ projects, 85% helpful)
 * - Level 4 (Cross-Org): Explicitly shared across orgs (90% helpful)
 * - Level 5 (Global): Admin approved, anonymized (95% helpful)
 *
 * For backwards compatibility, this service still uses the legacy 4-level logic
 * (Observation -> Local/User -> Company/Project -> Shared/Global) until full migration.
 */
@Injectable()
export class GraduationService {
  private readonly logger = new Logger(GraduationService.name);
  private pendingApprovals: Map<string, GraduationCandidate> = new Map();

  constructor(
    private readonly patternLibrary: PatternLibraryService,
    private readonly observationService: ObservationService,
  ) {}

  /**
   * Check if a pattern can graduate to the next level
   */
  async checkGraduation(patternId: string): Promise<GraduationResult> {
    const pattern = this.patternLibrary.getPattern(patternId);
    if (!pattern) {
      return {
        canGraduate: false,
        reason: `Pattern not found: ${patternId}`,
      };
    }

    const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
    // CEDA-95: Use GLOBAL (level 5) as max level
    if (currentLevel >= PatternLevel.GLOBAL) {
      return {
        canGraduate: false,
        reason: 'Pattern is already at maximum level (Global)',
      };
    }

    const stats = await this.calculateStats(patternId);

    // CEDA-95: Map old 4-level logic to new 6-level model for backwards compatibility
    // Observation (0) -> User (1) -> Project (2) -> Global (5)
    // Levels 3 (ORG) and 4 (CROSS_ORG) are skipped in legacy mode
    switch (currentLevel) {
      case PatternLevel.OBSERVATION:
        return this.checkLocalCriteria(stats);
      case PatternLevel.USER:
        return this.checkCompanyCriteria(stats);
      case PatternLevel.PROJECT:
        return this.checkSharedCriteria(stats);
      default:
        return {
          canGraduate: false,
          reason: `Unknown pattern level: ${currentLevel}`,
        };
    }
  }

  /**
   * Graduate a pattern to a new level
   * CEDA-67: Also persists graduation status to Redis
   */
  async graduate(patternId: string, toLevel: PatternLevel): Promise<Pattern | null> {
    const pattern = this.patternLibrary.getPattern(patternId);
    if (!pattern) {
      this.logger.warn(`Cannot graduate: Pattern not found: ${patternId}`);
      return null;
    }

    const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
    if (toLevel <= currentLevel) {
      this.logger.warn(`Cannot graduate: Target level ${toLevel} is not higher than current level ${currentLevel}`);
      return null;
    }

    // CEDA-95: Allow legacy graduation path (PROJECT -> GLOBAL) for backwards compatibility
    // The new 6-level model has ORG (3) and CROSS_ORG (4) between PROJECT (2) and GLOBAL (5)
    // but existing code expects direct PROJECT -> GLOBAL graduation
    const isLegacyGlobalGraduation = currentLevel === PatternLevel.PROJECT && toLevel === PatternLevel.GLOBAL;
    if (toLevel > currentLevel + 1 && !isLegacyGlobalGraduation) {
      this.logger.warn(`Cannot graduate: Cannot skip levels (${currentLevel} -> ${toLevel})`);
      return null;
    }

    let updatedStructure = pattern.structure;
    let company = pattern.company;

    // CEDA-95: Anonymize at GLOBAL level (was SHARED)
    if (toLevel === PatternLevel.GLOBAL) {
      updatedStructure = this.anonymize(pattern.structure);
      company = '*';
      this.logger.log(`Anonymized pattern ${patternId} for global level`);
    }

    const updatedPattern: Pattern = {
      ...pattern,
      structure: updatedStructure,
      company,
      level: toLevel,
      graduatedAt: new Date(),
    };

    this.patternLibrary.registerPattern(updatedPattern);
    this.pendingApprovals.delete(patternId);

    // CEDA-67: Persist graduation status to Redis
    if (upstashRedis.isEnabled()) {
      const levelName = this.levelToStateName(toLevel);
      await upstashRedis.updateGraduation(patternId, 'graduated', levelName).catch((err) => {
        this.logger.warn(`Failed to persist graduation to Redis: ${err}`);
      });
    }

    this.logger.log(`Graduated pattern ${patternId} from level ${currentLevel} to ${toLevel}`);

    return updatedPattern;
  }

  /**
   * CEDA-67: Map PatternLevel to Redis adaptive state level name
   * CEDA-95: Updated for 6-level model
   */
  private levelToStateName(level: PatternLevel): PatternAdaptiveState['level'] {
    switch (level) {
      case PatternLevel.OBSERVATION:
      case PatternLevel.USER:
        return 'user';
      case PatternLevel.PROJECT:
      case PatternLevel.ORG:
        return 'project';
      case PatternLevel.CROSS_ORG:
      case PatternLevel.GLOBAL:
        return 'global';
      default:
        return 'user';
    }
  }

  /**
   * Get graduation status for a pattern
   */
  async getGraduationStatus(patternId: string): Promise<GraduationStatus | null> {
    const pattern = this.patternLibrary.getPattern(patternId);
    if (!pattern) {
      return null;
    }

    const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
    const stats = await this.calculateStats(patternId);
    const graduationResult = await this.checkGraduation(patternId);

    const progress = this.calculateProgress(currentLevel, stats);
    const missingCriteria = this.getMissingCriteria(currentLevel, stats);

    return {
      patternId,
      currentLevel,
      stats,
      canGraduate: graduationResult.canGraduate,
      nextLevel: graduationResult.toLevel,
      requiresApproval: graduationResult.requiresApproval,
      progress,
      missingCriteria: missingCriteria.length > 0 ? missingCriteria : undefined,
    };
  }

  /**
   * Get all patterns that are candidates for graduation
   */
  async getGraduationCandidates(targetLevel?: PatternLevel): Promise<GraduationCandidate[]> {
    const candidates: GraduationCandidate[] = [];
    const patterns = this.patternLibrary.getAllPatterns();

    for (const pattern of patterns) {
      const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
      // CEDA-95: Use GLOBAL as max level
      if (currentLevel >= PatternLevel.GLOBAL) {
        continue;
      }

      if (targetLevel !== undefined && currentLevel + 1 !== targetLevel) {
        continue;
      }

      const graduationResult = await this.checkGraduation(pattern.id);
      if (graduationResult.canGraduate && graduationResult.toLevel !== undefined) {
        const stats = await this.calculateStats(pattern.id);
        candidates.push({
          patternId: pattern.id,
          patternName: pattern.name,
          currentLevel,
          targetLevel: graduationResult.toLevel,
          stats,
          eligibleSince: new Date(),
        });
      }
    }

    return candidates;
  }

  /**
   * Approve graduation for a pattern (admin action for level 2 -> 3)
   */
  async approveGraduation(
    patternId: string,
    adminUserId: string,
    comment?: string,
  ): Promise<ApproveGraduationResponse> {
    const pattern = this.patternLibrary.getPattern(patternId);
    if (!pattern) {
      return {
        success: false,
        patternId,
        newLevel: PatternLevel.OBSERVATION,
        graduatedAt: new Date(),
        anonymized: false,
      };
    }

    const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
    // CEDA-95: Approval required at PROJECT level (was COMPANY)
    if (currentLevel !== PatternLevel.PROJECT) {
      this.logger.warn(`Cannot approve graduation: Pattern ${patternId} is not at Project level`);
      return {
        success: false,
        patternId,
        newLevel: currentLevel,
        graduatedAt: new Date(),
        anonymized: false,
      };
    }

    const graduationResult = await this.checkGraduation(patternId);
    if (!graduationResult.canGraduate) {
      this.logger.warn(`Cannot approve graduation: Pattern ${patternId} does not meet criteria`);
      return {
        success: false,
        patternId,
        newLevel: currentLevel,
        graduatedAt: new Date(),
        anonymized: false,
      };
    }

    this.logger.log(`Admin ${adminUserId} approved graduation for pattern ${patternId}${comment ? `: ${comment}` : ''}`);

    // CEDA-95: Graduate to GLOBAL level (was SHARED)
    const graduatedPattern = await this.graduate(patternId, PatternLevel.GLOBAL);
    if (!graduatedPattern) {
      return {
        success: false,
        patternId,
        newLevel: currentLevel,
        graduatedAt: new Date(),
        anonymized: false,
      };
    }

    return {
      success: true,
      patternId,
      newLevel: PatternLevel.GLOBAL,
      graduatedAt: graduatedPattern.graduatedAt || new Date(),
      anonymized: true,
    };
  }

  /**
   * Run daily graduation check for all patterns
   * Auto-graduates patterns that meet criteria (except level 2 -> 3 which requires approval)
   */
  async checkAllGraduations(): Promise<{ graduated: string[]; pendingApproval: string[] }> {
    const graduated: string[] = [];
    const pendingApproval: string[] = [];

    const patterns = this.patternLibrary.getAllPatterns();

    for (const pattern of patterns) {
      const currentLevel = pattern.level ?? PatternLevel.OBSERVATION;
      // CEDA-95: Use GLOBAL as max level
      if (currentLevel >= PatternLevel.GLOBAL) {
        continue;
      }

      const result = await this.checkGraduation(pattern.id);
      if (result.canGraduate && result.toLevel !== undefined) {
        if (result.requiresApproval) {
          const stats = await this.calculateStats(pattern.id);
          this.pendingApprovals.set(pattern.id, {
            patternId: pattern.id,
            patternName: pattern.name,
            currentLevel,
            targetLevel: result.toLevel,
            stats,
            eligibleSince: new Date(),
          });
          pendingApproval.push(pattern.id);
          this.logger.log(`Pattern ${pattern.id} pending admin approval for graduation to level ${result.toLevel}`);
        } else {
          const graduatedPattern = await this.graduate(pattern.id, result.toLevel);
          if (graduatedPattern) {
            graduated.push(pattern.id);
          }
        }
      }
    }

    this.logger.log(`Daily graduation check complete: ${graduated.length} graduated, ${pendingApproval.length} pending approval`);

    return { graduated, pendingApproval };
  }

  /**
   * Get patterns pending admin approval
   */
  getPendingApprovals(): GraduationCandidate[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Anonymize pattern structure for shared level
   * Removes company-specific field names and generalizes domain-specific values
   */
  anonymize(structure: PatternStructure): PatternStructure {
    const anonymizedSections = structure.sections.map((section, index) =>
      this.anonymizeSection(section, index),
    );

    return {
      ...structure,
      sections: anonymizedSections,
    };
  }

  /**
   * Anonymize a single section
   */
  private anonymizeSection(section: PatternSection, index: number): PatternSection {
    const genericName = this.generalizeFieldName(section.name, index);
    const genericFieldTypes = section.fieldTypes.map((ft, i) =>
      this.generalizeFieldType(ft, i),
    );

    return {
      ...section,
      name: genericName,
      fieldTypes: genericFieldTypes,
    };
  }

  /**
   * Generalize a field name to remove company-specific terminology
   */
  private generalizeFieldName(name: string, index: number): string {
    const companySpecificPatterns = [
      /company/i,
      /corp/i,
      /inc/i,
      /ltd/i,
      /llc/i,
      /internal/i,
      /proprietary/i,
    ];

    for (const pattern of companySpecificPatterns) {
      if (pattern.test(name)) {
        return `Section ${index + 1}`;
      }
    }

    const genericMappings: Record<string, string> = {
      'employee': 'Person',
      'staff': 'Person',
      'worker': 'Person',
      'customer': 'Entity',
      'client': 'Entity',
      'vendor': 'Entity',
      'supplier': 'Entity',
    };

    let result = name;
    for (const [specific, generic] of Object.entries(genericMappings)) {
      result = result.replace(new RegExp(specific, 'gi'), generic);
    }

    return result;
  }

  /**
   * Generalize a field type
   */
  private generalizeFieldType(fieldType: string, _index: number): string {
    const typeNormalizations: Record<string, string> = {
      'employee_id': 'identifier',
      'staff_id': 'identifier',
      'customer_id': 'identifier',
      'client_id': 'identifier',
      'company_name': 'name',
      'corp_name': 'name',
      'internal_code': 'code',
      'proprietary_field': 'custom_field',
    };

    const normalized = fieldType.toLowerCase();
    return typeNormalizations[normalized] || fieldType;
  }

  /**
   * Calculate graduation statistics for a pattern
   * CEDA-95: Added uniqueProjects and helpfulRate fields
   */
  private async calculateStats(patternId: string): Promise<GraduationStats> {
    const observations = this.observationService.getObservationsByPattern(patternId);

    if (observations.length === 0) {
      return {
        totalObservations: 0,
        uniqueUsers: 0,
        uniqueProjects: 0,
        uniqueCompanies: 0,
        helpfulRate: 0,
        acceptanceRate: 0,
        modificationRate: 0,
        rejectionRate: 0,
      };
    }

    const uniqueUsers = new Set(observations.map(o => o.user));
    const uniqueProjects = new Set(observations.map(o => o.project).filter(Boolean));
    const uniqueCompanies = new Set(observations.map(o => o.company));

    const accepted = observations.filter(o => o.outcome === 'accepted').length;
    const modified = observations.filter(o => o.outcome === 'modified').length;
    const rejected = observations.filter(o => o.outcome === 'rejected').length;

    // CEDA-95: Calculate helpful rate (accepted + modified are considered helpful)
    const helpful = accepted + modified;
    const helpfulRate = observations.length > 0 ? helpful / observations.length : 0;

    return {
      totalObservations: observations.length,
      uniqueUsers: uniqueUsers.size,
      uniqueProjects: uniqueProjects.size,
      uniqueCompanies: uniqueCompanies.size,
      helpfulRate,
      acceptanceRate: accepted / observations.length,
      modificationRate: modified / observations.length,
      rejectionRate: rejected / observations.length,
    };
  }

  /**
   * Check criteria for graduating from Observation to Local
   */
  private checkLocalCriteria(stats: GraduationStats): GraduationResult {
    const criteria = DEFAULT_GRADUATION_CRITERIA.local;

    if (stats.totalObservations < criteria.minObservations) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minObservations} observations, have ${stats.totalObservations}`,
      };
    }

    if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate! * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate! * 100}%`,
      };
    }

    // CEDA-95: Graduate to USER level (was LOCAL)
    return {
      canGraduate: true,
      toLevel: PatternLevel.USER,
      stats,
    };
  }

  /**
   * Check criteria for graduating from User to Project (was Local to Company)
   */
  private checkCompanyCriteria(stats: GraduationStats): GraduationResult {
    const criteria = DEFAULT_GRADUATION_CRITERIA.company;

    if (stats.uniqueUsers < criteria.minUsers) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minUsers} unique users, have ${stats.uniqueUsers}`,
      };
    }

    if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate! * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate! * 100}%`,
      };
    }

    // CEDA-95: Graduate to PROJECT level (was COMPANY)
    return {
      canGraduate: true,
      toLevel: PatternLevel.PROJECT,
      requiresApproval: criteria.adminApproval,
      stats,
    };
  }

  /**
   * Check criteria for graduating from Project to Global (was Company to Shared)
   */
  private checkSharedCriteria(stats: GraduationStats): GraduationResult {
    const criteria = DEFAULT_GRADUATION_CRITERIA.shared;

    if (stats.uniqueCompanies < criteria.minCompanies!) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minCompanies!} unique companies, have ${stats.uniqueCompanies}`,
      };
    }

    if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate! * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate!) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate! * 100}%`,
      };
    }

    // CEDA-95: Graduate to GLOBAL level (was SHARED)
    return {
      canGraduate: true,
      toLevel: PatternLevel.GLOBAL,
      requiresApproval: criteria.adminApproval,
      stats,
    };
  }

  /**
   * Calculate progress towards next level (0.0 - 1.0)
   * CEDA-95: Updated for new enum values
   */
  private calculateProgress(currentLevel: PatternLevel, stats: GraduationStats): number {
    switch (currentLevel) {
      case PatternLevel.OBSERVATION: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.local;
        const obsProgress = Math.min(stats.totalObservations / criteria.minObservations, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate!, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate! ? 1 : 0;
        return (obsProgress + acceptProgress + modProgress) / 3;
      }
      case PatternLevel.USER: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.company;
        const userProgress = Math.min(stats.uniqueUsers / criteria.minUsers, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate!, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate! ? 1 : 0;
        return (userProgress + acceptProgress + modProgress) / 3;
      }
      case PatternLevel.PROJECT: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.shared;
        const companyProgress = Math.min(stats.uniqueCompanies / criteria.minCompanies!, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate!, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate! ? 1 : 0;
        return (companyProgress + acceptProgress + modProgress) / 3;
      }
      default:
        return 1;
    }
  }

  /**
   * Get list of missing criteria for graduation
   * CEDA-95: Updated for new enum values
   */
  private getMissingCriteria(currentLevel: PatternLevel, stats: GraduationStats): string[] {
    const missing: string[] = [];

    switch (currentLevel) {
      case PatternLevel.OBSERVATION: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.local;
        if (stats.totalObservations < criteria.minObservations) {
          missing.push(`Need ${criteria.minObservations - stats.totalObservations} more observations`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate! * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate!) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate! * 100}%`);
        }
        break;
      }
      case PatternLevel.USER: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.company;
        if (stats.uniqueUsers < criteria.minUsers) {
          missing.push(`Need ${criteria.minUsers - stats.uniqueUsers} more unique users`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate! * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate!) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate! * 100}%`);
        }
        break;
      }
      case PatternLevel.PROJECT: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.shared;
        if (stats.uniqueCompanies < criteria.minCompanies!) {
          missing.push(`Need ${criteria.minCompanies! - stats.uniqueCompanies} more unique companies`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate!) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate! * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate!) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate! * 100}%`);
        }
        break;
      }
    }

    return missing;
  }

  /**
   * Clear pending approvals (for testing)
   */
  clearPendingApprovals(): void {
    this.pendingApprovals.clear();
  }
}
