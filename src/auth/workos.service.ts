/**
 * CEDA: WorkOS Authentication Service
 *
 * Handles WorkOS AuthKit flow for enterprise SSO including:
 * - Authorization URL generation
 * - Code exchange for access token
 * - User profile retrieval
 * - Organization membership
 *
 * Used by Wave (wave.getceda.com) for enterprise clients
 */

import { WorkOS } from '@workos-inc/node';

export interface WorkOSUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  organizationId: string | null;
}

export interface WorkOSAuthResult {
  user: WorkOSUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * WorkOS Authentication Service
 * Handles enterprise SSO via WorkOS AuthKit
 */
export class WorkOSService {
  private workos: WorkOS | null = null;
  private clientId: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.WORKOS_CLIENT_ID || '';
    const apiKey = process.env.WORKOS_API_KEY || '';
    this.redirectUri = process.env.WORKOS_REDIRECT_URI ||
      'https://wave.getceda.com/api/auth/workos/callback';

    if (apiKey) {
      this.workos = new WorkOS(apiKey);
    }
  }

  /**
   * Check if WorkOS is configured
   */
  isConfigured(): boolean {
    return !!(this.workos && this.clientId);
  }

  /**
   * Generate WorkOS authorization URL
   */
  getAuthorizationUrl(state: string, organizationId?: string): string {
    if (!this.workos) {
      throw new Error('WorkOS not configured');
    }

    const params: Record<string, string> = {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
    };

    // If organization specified, use SSO
    if (organizationId) {
      params.organization = organizationId;
    }

    const baseUrl = 'https://api.workos.com/user_management/authorize';
    const searchParams = new URLSearchParams(params);
    return `${baseUrl}?${searchParams.toString()}`;
  }

  /**
   * Exchange authorization code for tokens and user info
   */
  async authenticateWithCode(code: string): Promise<WorkOSAuthResult> {
    if (!this.workos) {
      throw new Error('WorkOS not configured');
    }

    const { user, organizationId, accessToken, refreshToken } = await this.workos.userManagement.authenticateWithCode({
      clientId: this.clientId,
      code,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePictureUrl: user.profilePictureUrl,
        organizationId: organizationId || null,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * List organizations for user selection
   */
  async listOrganizations(): Promise<Array<{ id: string; name: string }>> {
    if (!this.workos) {
      return [];
    }

    const { data } = await this.workos.organizations.listOrganizations();
    return data.map(org => ({
      id: org.id,
      name: org.name,
    }));
  }
}

// Singleton instance
let workosService: WorkOSService | null = null;

export function getWorkOSService(): WorkOSService {
  if (!workosService) {
    workosService = new WorkOSService();
  }
  return workosService;
}
