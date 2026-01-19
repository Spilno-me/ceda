/**
 * Google OAuth Service
 *
 * Handles Google OAuth flow for business users (Wave).
 * Similar pattern to GitHubService but for Google accounts.
 */

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export class GoogleService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const publicUrl = process.env.CEDA_PUBLIC_URL || 'http://localhost:3030';
    this.redirectUri = `${publicUrl}/api/auth/google/callback`;
  }

  /**
   * Check if Google OAuth is configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${GOOGLE_OAUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    const data: GoogleTokenResponse = await response.json();

    if (data.error) {
      throw new Error(`Google OAuth error: ${data.error_description || data.error}`);
    }

    return data;
  }

  /**
   * Get user profile from Google
   */
  async getUserProfile(accessToken: string): Promise<GoogleUser> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google user profile: ${response.statusText}`);
    }

    return response.json();
  }
}

// Singleton
let googleService: GoogleService | null = null;

export function getGoogleService(): GoogleService {
  if (!googleService) {
    googleService = new GoogleService();
  }
  return googleService;
}
