/**
 * CEDA-36: Graduation Service
 *
 * Manages pattern graduation from observations to shared patterns.
 * Patterns evolve through levels based on usage and acceptance criteria.
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

/**
 * GraduationService - Pattern graduation management
 *
 * Handles the evolution of patterns from observations to shared patterns:
 * - Level 0 (Observation): Initial pattern from user input
 * - Level 1 (Local): Validated for a single user (3+ obs, 70% acceptance)
 * - Level 2 (Company): Validated across users in a company (5+ users, 80% acceptance)
 * - Level 3 (Shared): Validated across companies, anonymized (3+ companies, 90% acceptance)
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
    if (currentLevel >= PatternLevel.SHARED) {
      return {
        canGraduate: false,
        reason: 'Pattern is already at maximum level (Shared)',
      };
    }

    const stats = await this.calculateStats(patternId);

    switch (currentLevel) {
      case PatternLevel.OBSERVATION:
        return this.checkLocalCriteria(stats);
      case PatternLevel.LOCAL:
        return this.checkCompanyCriteria(stats);
      case PatternLevel.COMPANY:
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

    if (toLevel > currentLevel + 1) {
      this.logger.warn(`Cannot graduate: Cannot skip levels (${currentLevel} -> ${toLevel})`);
      return null;
    }

    let updatedStructure = pattern.structure;
    let company = pattern.company;

    if (toLevel === PatternLevel.SHARED) {
      updatedStructure = this.anonymize(pattern.structure);
      company = '*';
      this.logger.log(`Anonymized pattern ${patternId} for shared level`);
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

    this.logger.log(`Graduated pattern ${patternId} from level ${currentLevel} to ${toLevel}`);

    return updatedPattern;
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
      if (currentLevel >= PatternLevel.SHARED) {
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
    if (currentLevel !== PatternLevel.COMPANY) {
      this.logger.warn(`Cannot approve graduation: Pattern ${patternId} is not at Company level`);
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

    const graduatedPattern = await this.graduate(patternId, PatternLevel.SHARED);
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
      newLevel: PatternLevel.SHARED,
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
      if (currentLevel >= PatternLevel.SHARED) {
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
   */
  private async calculateStats(patternId: string): Promise<GraduationStats> {
    const observations = this.observationService.getObservationsByPattern(patternId);

    if (observations.length === 0) {
      return {
        totalObservations: 0,
        uniqueUsers: 0,
        uniqueCompanies: 0,
        acceptanceRate: 0,
        modificationRate: 0,
        rejectionRate: 0,
      };
    }

    const uniqueUsers = new Set(observations.map(o => o.user));
    const uniqueCompanies = new Set(observations.map(o => o.company));

    const accepted = observations.filter(o => o.outcome === 'accepted').length;
    const modified = observations.filter(o => o.outcome === 'modified').length;
    const rejected = observations.filter(o => o.outcome === 'rejected').length;

    return {
      totalObservations: observations.length,
      uniqueUsers: uniqueUsers.size,
      uniqueCompanies: uniqueCompanies.size,
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

    if (stats.acceptanceRate < criteria.minAcceptanceRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate * 100}%`,
      };
    }

    return {
      canGraduate: true,
      toLevel: PatternLevel.LOCAL,
      stats,
    };
  }

  /**
   * Check criteria for graduating from Local to Company
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

    if (stats.acceptanceRate < criteria.minAcceptanceRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate * 100}%`,
      };
    }

    return {
      canGraduate: true,
      toLevel: PatternLevel.COMPANY,
      requiresApproval: criteria.adminApproval,
      stats,
    };
  }

  /**
   * Check criteria for graduating from Company to Shared
   */
  private checkSharedCriteria(stats: GraduationStats): GraduationResult {
    const criteria = DEFAULT_GRADUATION_CRITERIA.shared;

    if (stats.uniqueCompanies < criteria.minCompanies) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minCompanies} unique companies, have ${stats.uniqueCompanies}`,
      };
    }

    if (stats.acceptanceRate < criteria.minAcceptanceRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Need ${criteria.minAcceptanceRate * 100}% acceptance rate, have ${(stats.acceptanceRate * 100).toFixed(1)}%`,
      };
    }

    if (stats.modificationRate > criteria.maxModificationRate) {
      return {
        canGraduate: false,
        stats,
        reason: `Modification rate ${(stats.modificationRate * 100).toFixed(1)}% exceeds maximum ${criteria.maxModificationRate * 100}%`,
      };
    }

    return {
      canGraduate: true,
      toLevel: PatternLevel.SHARED,
      requiresApproval: criteria.adminApproval,
      stats,
    };
  }

  /**
   * Calculate progress towards next level (0.0 - 1.0)
   */
  private calculateProgress(currentLevel: PatternLevel, stats: GraduationStats): number {
    switch (currentLevel) {
      case PatternLevel.OBSERVATION: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.local;
        const obsProgress = Math.min(stats.totalObservations / criteria.minObservations, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate ? 1 : 0;
        return (obsProgress + acceptProgress + modProgress) / 3;
      }
      case PatternLevel.LOCAL: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.company;
        const userProgress = Math.min(stats.uniqueUsers / criteria.minUsers, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate ? 1 : 0;
        return (userProgress + acceptProgress + modProgress) / 3;
      }
      case PatternLevel.COMPANY: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.shared;
        const companyProgress = Math.min(stats.uniqueCompanies / criteria.minCompanies, 1);
        const acceptProgress = Math.min(stats.acceptanceRate / criteria.minAcceptanceRate, 1);
        const modProgress = stats.modificationRate <= criteria.maxModificationRate ? 1 : 0;
        return (companyProgress + acceptProgress + modProgress) / 3;
      }
      default:
        return 1;
    }
  }

  /**
   * Get list of missing criteria for graduation
   */
  private getMissingCriteria(currentLevel: PatternLevel, stats: GraduationStats): string[] {
    const missing: string[] = [];

    switch (currentLevel) {
      case PatternLevel.OBSERVATION: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.local;
        if (stats.totalObservations < criteria.minObservations) {
          missing.push(`Need ${criteria.minObservations - stats.totalObservations} more observations`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate * 100}%`);
        }
        break;
      }
      case PatternLevel.LOCAL: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.company;
        if (stats.uniqueUsers < criteria.minUsers) {
          missing.push(`Need ${criteria.minUsers - stats.uniqueUsers} more unique users`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate * 100}%`);
        }
        break;
      }
      case PatternLevel.COMPANY: {
        const criteria = DEFAULT_GRADUATION_CRITERIA.shared;
        if (stats.uniqueCompanies < criteria.minCompanies) {
          missing.push(`Need ${criteria.minCompanies - stats.uniqueCompanies} more unique companies`);
        }
        if (stats.acceptanceRate < criteria.minAcceptanceRate) {
          missing.push(`Acceptance rate needs to increase from ${(stats.acceptanceRate * 100).toFixed(1)}% to ${criteria.minAcceptanceRate * 100}%`);
        }
        if (stats.modificationRate > criteria.maxModificationRate) {
          missing.push(`Modification rate needs to decrease from ${(stats.modificationRate * 100).toFixed(1)}% to below ${criteria.maxModificationRate * 100}%`);
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
