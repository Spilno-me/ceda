/**
 * CEDA Frontend - Shared JavaScript Utilities
 * Handles authentication, API calls, and common functionality
 */

const CEDA = {
  // Storage keys
  TOKEN_KEY: 'ceda_token',
  USER_KEY: 'ceda_user',

  /**
   * Get stored JWT token
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * Store JWT token
   */
  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  /**
   * Clear stored token and user data
   */
  clearAuth() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;
    
    // Check if token is expired (basic JWT decode)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  /**
   * Get stored user data
   */
  getUser() {
    const data = localStorage.getItem(this.USER_KEY);
    return data ? JSON.parse(data) : null;
  },

  /**
   * Store user data
   */
  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  /**
   * Make authenticated API request
   */
  async api(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearAuth();
      window.location.href = '/';
      throw new Error('Unauthorized');
    }

    return response;
  },

  /**
   * Fetch user profile from API
   */
  async getProfile() {
    const response = await this.api('/api/profile');
    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }
    return response.json();
  },

  /**
   * Update user preferences
   */
  async updatePreferences(preferences) {
    const response = await this.api('/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    });
    if (!response.ok) {
      throw new Error('Failed to update preferences');
    }
    return response.json();
  },

  /**
   * Generate Herald MCP config
   * AI-native: Token for identity, git remote for context
   */
  generateHeraldConfig() {
    const token = this.getToken();
    return {
      mcpServers: {
        herald: {
          command: 'npx',
          args: ['@spilno/herald-mcp'],
          env: {
            CEDA_URL: 'https://getceda.com',
            CEDA_TOKEN: token,
            // Context derived from git remote automatically
          },
        },
      },
    };
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      }
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },

  /**
   * Show error message
   */
  showError(container, message) {
    const existing = container.querySelector('.error-message');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = message;
    container.prepend(div);
  },

  /**
   * Show success message
   */
  showSuccess(container, message) {
    const existing = container.querySelector('.success-message');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'success-message';
    div.textContent = message;
    container.prepend(div);
  },

  /**
   * Show loading state
   */
  showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  },

  /**
   * Initialize page - check auth and redirect if needed
   */
  initPage(requireAuth = true) {
    // Check for token in URL (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      this.setToken(token);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check authentication
    if (requireAuth && !this.isAuthenticated()) {
      window.location.href = '/';
      return false;
    }

    return true;
  },

  /**
   * Logout user
   */
  logout() {
    this.clearAuth();
    window.location.href = '/';
  },

  /**
   * Get initials from name or login
   */
  getInitials(name) {
    if (!name) return '?';
    return name
      .split(/[\s-_]+/)
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  },

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  },
};

// Export for use in other scripts
window.CEDA = CEDA;
