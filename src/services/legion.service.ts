import { Injectable, Logger } from '@nestjs/common';
import { StructurePrediction } from '../interfaces';

/**
 * CEDA-32: Proposal status for LEGION integration
 */
export type ProposalStatus = 'proposed' | 'executed' | 'rejected';

/**
 * CEDA-32: Execution result from LEGION
 */
export type ExecutionResult = 'success' | 'partial' | 'failed';

/**
 * CEDA-32: Proposal stored in LEGION
 */
export interface LegionProposal {
  id: string;
  sessionId: string;
  patternId: string;
  prediction: StructurePrediction;
  confidence: number;
  status: ProposalStatus;
  executionResult?: ExecutionResult;
  modifications?: Record<string, unknown>[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CEDA-32: Grounding feedback from LEGION
 */
export interface GroundingFeedback {
  sessionId: string;
  patternId: string;
  accepted: boolean;
  modifications?: Record<string, unknown>[];
  executionResult: ExecutionResult;
}

/**
 * CEDA-32: LegionService - Stub for future LEGION integration
 * 
 * Provides graceful degradation when LEGION is unavailable.
 * Uses LEGION_API_URL environment variable for configuration.
 * 
 * LEGION stores facts and execution results, enabling:
 * - Pattern confidence grounding based on real-world execution
 * - Learning from user modifications
 * - Cross-session pattern improvement
 */
@Injectable()
export class LegionService {
  private readonly logger = new Logger(LegionService.name);
  private readonly apiUrl: string | null;
  private available: boolean = false;

  constructor() {
    this.apiUrl = process.env.LEGION_API_URL || null;
    if (this.apiUrl) {
      this.logger.log(`LEGION integration configured: ${this.apiUrl}`);
      this.checkAvailability();
    } else {
      this.logger.warn('LEGION_API_URL not set - running in standalone mode (graceful degradation)');
    }
  }

  /**
   * Check if LEGION service is available
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Check LEGION availability (called on startup)
   */
  private async checkAvailability(): Promise<void> {
    if (!this.apiUrl) {
      this.available = false;
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      this.available = response.ok;
      this.logger.log(`LEGION availability check: ${this.available ? 'available' : 'unavailable'}`);
    } catch (error) {
      this.available = false;
      this.logger.warn(`LEGION unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store CEDA prediction as proposal in LEGION
   * @param prediction - The prediction to store
   * @param sessionId - Session identifier
   * @param patternId - Pattern used for prediction
   * @returns Proposal ID or null if LEGION unavailable
   */
  async createProposal(
    prediction: StructurePrediction,
    sessionId: string,
    patternId: string,
  ): Promise<string | null> {
    if (!this.available || !this.apiUrl) {
      this.logger.debug('LEGION unavailable - skipping proposal creation');
      return null;
    }

    try {
      const response = await fetch(`${this.apiUrl}/legion/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: JSON.stringify(prediction),
          metadata: {
            type: 'ceda_prediction',
            session_id: sessionId,
            pattern_id: patternId,
            confidence: prediction.confidence,
            status: 'proposed',
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Failed to create proposal: ${response.status}`);
        return null;
      }

      const data = await response.json() as { id: string };
      this.logger.log(`Proposal created: ${data.id}`);
      return data.id;
    } catch (error) {
      this.logger.warn(`Error creating proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Update proposal status after execution
   * @param proposalId - The proposal ID to update
   * @param status - New status
   * @param result - Execution result
   * @param modifications - User modifications (if any)
   * @returns Success status
   */
  async updateProposal(
    proposalId: string,
    status: ProposalStatus,
    result?: ExecutionResult,
    modifications?: Record<string, unknown>[],
  ): Promise<boolean> {
    if (!this.available || !this.apiUrl) {
      this.logger.debug('LEGION unavailable - skipping proposal update');
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/legion/proposals/${proposalId}/execute`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            status,
            result,
            modifications,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Failed to update proposal: ${response.status}`);
        return false;
      }

      this.logger.log(`Proposal updated: ${proposalId} -> ${status}`);
      return true;
    } catch (error) {
      this.logger.warn(`Error updating proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Query execution history for a pattern
   * @param patternId - Pattern ID to query
   * @returns Array of proposals or empty array if unavailable
   */
  async queryProposals(patternId: string): Promise<LegionProposal[]> {
    if (!this.available || !this.apiUrl) {
      this.logger.debug('LEGION unavailable - returning empty proposals');
      return [];
    }

    try {
      const response = await fetch(`${this.apiUrl}/legion/proposals?pattern_id=${patternId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Failed to query proposals: ${response.status}`);
        return [];
      }

      const data = await response.json() as { proposals: LegionProposal[] };
      return data.proposals || [];
    } catch (error) {
      this.logger.warn(`Error querying proposals: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Process grounding feedback from execution
   * This is called when LEGION sends execution results back to CEDA
   * @param feedback - Grounding feedback from LEGION
   * @returns Success status
   */
  async processGroundingFeedback(feedback: GroundingFeedback): Promise<boolean> {
    this.logger.log(`Processing grounding feedback for session ${feedback.sessionId}`);
    return true;
  }

  /**
   * Refresh LEGION availability status
   * Call this periodically or after connection errors
   */
  async refreshAvailability(): Promise<boolean> {
    await this.checkAvailability();
    return this.available;
  }
}
