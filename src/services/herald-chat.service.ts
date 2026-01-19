/**
 * Herald Chat Service
 *
 * Processes messages through Claude with org/project playbooks.
 * This is the cooperation protocol - Claude is the brain, playbook is the instructions.
 *
 * MVP: Hardcoded playbook for goprint/mobidruk
 * Later: Fetch from vault
 */

import Anthropic from '@anthropic-ai/sdk';
import * as reflections from '../db/reflections';

export interface ChatRequest {
  message: string;
  surface: 'telegram' | 'slack' | 'wave' | 'mcp' | 'api';
  org: string;
  project: string;
  user_id: string;
  session_id?: string;
  metadata?: Record<string, any>;
}

export interface ChatResponse {
  response: string;
  actions_taken: Array<{
    type: string;
    id?: string;
    feeling?: string;
    insight?: string;
  }>;
  patterns_found: number;
  session_id: string;
}

// Tool definitions for Claude
const HERALD_TOOLS: Anthropic.Tool[] = [
  {
    name: 'capture_pattern',
    description: 'Capture a pattern (bug, success, blocker, requirement) from the conversation. Use this when user reports something worth remembering.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['bug', 'success', 'blocker', 'requirement', 'insight'],
          description: 'Type of pattern being captured',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of the pattern (1-2 sentences)',
        },
        feeling: {
          type: 'string',
          enum: ['stuck', 'success'],
          description: 'stuck for bugs/blockers, success for wins',
        },
        details: {
          type: 'object',
          description: 'Additional structured details (device, version, etc.)',
        },
      },
      required: ['type', 'summary', 'feeling'],
    },
  },
  {
    name: 'query_patterns',
    description: 'Query existing patterns for this project. Use this when user asks about progress, status, or what has been reported.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['bug', 'success', 'blocker', 'requirement', 'all'],
          description: 'Type of patterns to query',
        },
        status: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by status',
        },
      },
      required: ['type'],
    },
  },
];

// Hardcoded playbooks for MVP
const PLAYBOOKS: Record<string, string> = {
  'goprint/mobidruk': `You are Herald for Mobidruk mobile printing app launch (tomorrow!).

## Your Mission
Track launch readiness. Capture bugs, blockers, wins. Keep the team moving fast.

## Language
Ukrainian preferred. English ok. Keep it short - people are on mobile.

## When User Reports a BUG
1. Acknowledge: "Зрозумів 🐛"
2. Ask ONE clarifying question if needed (device? OS version? steps to reproduce?)
3. Use capture_pattern tool with type="bug", feeling="stuck"

## When User Reports SUCCESS or WIN
1. Celebrate briefly: "🎉 Круто!"
2. Use capture_pattern tool with type="success", feeling="success"

## When User Reports BLOCKER
1. Acknowledge: "⚠️ Блокер зафіксовано"
2. Ask what's needed to unblock
3. Use capture_pattern tool with type="blocker", feeling="stuck"

## When User Asks PROGRESS or STATUS
1. Use query_patterns tool with type="all"
2. Summarize: X bugs (open/closed), Y wins, Z blockers
3. Keep it brief

## When User Adds REQUIREMENT
1. Acknowledge and confirm understanding
2. Use capture_pattern tool with type="requirement", feeling="success"

## Tone
- Fast, friendly, supportive
- Emoji ok but don't overdo
- Focus on ACTION not chat
- Match user's language (Ukrainian/English)

## Context
- App: Mobidruk (mobile printing from phone)
- Features: Print, QR scan, payments
- Launch: Tomorrow
- Stakes: High`,

  'default': `You are Herald, an AI assistant.

Help capture bugs, status updates, and insights from conversations.
Be helpful and concise. When user reports something important, use capture_pattern.
When user asks about progress, use query_patterns.`,
};

export class HeraldChatService {
  private anthropic: Anthropic | null = null;
  private capturedPatterns: ChatResponse['actions_taken'] = [];

  constructor() {
    this.initAnthropic();
  }

  private initAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
      console.log('[HeraldChat] Anthropic client initialized');
    } else {
      console.warn('[HeraldChat] ANTHROPIC_API_KEY not set - chat disabled');
    }
  }

  /**
   * Get playbook for org/project
   */
  getPlaybook(org: string, project: string): string {
    const key = `${org}/${project}`;
    return PLAYBOOKS[key] || PLAYBOOKS['default'];
  }

  /**
   * Execute tool call from Claude
   */
  private async executeTool(
    toolName: string,
    toolInput: Record<string, any>,
    context: { org: string; project: string; user_id: string }
  ): Promise<string> {
    console.log(`[HeraldChat] Executing tool: ${toolName}`, toolInput);

    if (toolName === 'capture_pattern') {
      // Capture pattern to CEDA
      const patternId = `PAT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Persist to database
      const saved = await reflections.insert({
        id: patternId,
        session: `${context.org}/${context.project}/${toolInput.type}`,
        feeling: toolInput.feeling as 'stuck' | 'success',
        insight: toolInput.summary,
        method: 'direct',
        outcome: toolInput.feeling === 'stuck' ? 'antipattern' : 'pattern',
        org: context.org,
        project: context.project,
        user: context.user_id,
      });

      if (saved) {
        this.capturedPatterns.push({
          type: toolInput.type,
          id: patternId,
          feeling: toolInput.feeling,
          insight: toolInput.summary,
        });

        console.log(`[HeraldChat] Pattern persisted to CEDA:`, {
          id: patternId,
          org: context.org,
          project: context.project,
          type: toolInput.type,
        });

        return JSON.stringify({
          success: true,
          id: patternId,
          message: `Pattern captured: ${toolInput.summary}`,
        });
      } else {
        console.error(`[HeraldChat] Failed to persist pattern`);
        return JSON.stringify({
          success: false,
          error: 'Failed to save pattern to database',
        });
      }
    }

    if (toolName === 'query_patterns') {
      // Query patterns from CEDA database
      const allPatterns = await reflections.findByOrg(context.org, {
        project: context.project,
        limit: 50,
      });

      // Count by type (based on session field which contains type)
      const bugs = allPatterns.filter(p => p.session.includes('/bug')).length;
      const successes = allPatterns.filter(p => p.feeling === 'success').length;
      const blockers = allPatterns.filter(p => p.session.includes('/blocker')).length;
      const requirements = allPatterns.filter(p => p.session.includes('/requirement')).length;

      // Get recent patterns for context
      const recentPatterns = allPatterns.slice(0, 5).map(p => ({
        id: p.id,
        type: p.session.split('/').pop(),
        summary: p.insight,
        feeling: p.feeling,
        created: p.created_at,
      }));

      return JSON.stringify({
        success: true,
        summary: {
          total: allPatterns.length,
          bugs,
          successes,
          blockers,
          requirements,
        },
        recent: recentPatterns,
        message: `Found ${allPatterns.length} patterns for ${context.org}/${context.project}`,
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  /**
   * Process chat message through Claude with playbook
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const sessionId = request.session_id || `${request.surface}_${request.user_id}_${Date.now()}`;
    this.capturedPatterns = []; // Reset for this request

    // Load playbook
    const playbook = this.getPlaybook(request.org, request.project);

    // Initial Claude call
    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: request.message }
    ];

    let response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: playbook,
      messages,
      tools: HERALD_TOOLS,
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Execute each tool
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await this.executeTool(
          toolUse.name,
          toolUse.input as Record<string, any>,
          { org: request.org, project: request.project, user_id: request.user_id }
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Continue conversation with tool results
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];

      response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: playbook,
        messages,
        tools: HERALD_TOOLS,
      });
    }

    // Extract final text response
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      response: responseText,
      actions_taken: this.capturedPatterns,
      patterns_found: 0, // TODO: Return actual count from query
      session_id: sessionId,
    };
  }

  /**
   * Health check
   */
  isReady(): boolean {
    return this.anthropic !== null;
  }
}

// Singleton instance
let chatService: HeraldChatService | null = null;

export function getHeraldChatService(): HeraldChatService {
  if (!chatService) {
    chatService = new HeraldChatService();
  }
  return chatService;
}
