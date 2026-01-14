#!/usr/bin/env node
/**
 * Herald MCP - AI-native interface to CEDA ecosystem
 *
 * Dual-mode:
 * - CLI mode (TTY): Natural commands for humans
 * - MCP mode (piped): JSON-RPC for AI agents
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import * as readline from "readline";

import { runInit } from "./cli/init.js";

// Configuration - all sensitive values from environment only
// CEDA_URL is primary, HERALD_API_URL for backwards compat, default to cloud
const CEDA_API_URL = process.env.CEDA_URL || process.env.HERALD_API_URL || "https://getceda.com";
const CEDA_API_TOKEN = process.env.HERALD_API_TOKEN;
const CEDA_API_USER = process.env.HERALD_API_USER;
const CEDA_API_PASS = process.env.HERALD_API_PASS;

// Multi-tenant context
const HERALD_COMPANY = process.env.HERALD_COMPANY || "default";
const HERALD_PROJECT = process.env.HERALD_PROJECT || "default";
const HERALD_USER = process.env.HERALD_USER || "default";

// Offspring vault context (for Avatar mode)
const HERALD_VAULT = process.env.HERALD_VAULT || "";
const AEGIS_OFFSPRING_PATH = process.env.AEGIS_OFFSPRING_PATH || join(homedir(), "Documents", "aegis_ceda", "_offspring");

// Cloud mode: Use CEDA API for offspring communication instead of local files
const OFFSPRING_CLOUD_MODE = process.env.HERALD_OFFSPRING_CLOUD === "true";

const VERSION = "1.18.0";

// Self-routing description - teaches Claude when to call Herald
const HERALD_DESCRIPTION = `AI-native pattern learning for CEDA.

WHEN TO OFFER REFLECTION:
When you notice FRICTION (multiple iterations, debugging spirals, corrections, confusion)
or FLOW (clean first-pass execution, good instincts, smooth outcomes),
offer: "That was [rough/smooth]. Want me to capture this for pattern learning?"

IMPORTANT: Always ask user permission before calling herald_reflect.

Herald learns signal→outcome mappings to help future sessions.`;

// Auto-sync buffer on startup (future: HERALD_AUTO_SYNC=false to disable)
const AUTO_SYNC_ON_STARTUP = process.env.HERALD_AUTO_SYNC !== "false";

// AI API keys for Herald's voice and AI-native simulation
// SECURITY: Never bundle API keys in npm packages
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Session persistence - context-isolated paths
function getHeraldDir(): string {
  return join(homedir(), ".herald", HERALD_COMPANY, HERALD_PROJECT, HERALD_USER);
}

function getSessionFile(): string {
  return join(getHeraldDir(), "session");
}

function getBufferFile(): string {
  return join(getHeraldDir(), "insight_buffer.json");
}

interface BufferedInsight {
  insight: string;
  topic?: string;
  targetVault?: string;
  sourceVault?: string;
  company: string;
  project: string;
  user: string;
  bufferedAt: string;
}

function bufferInsight(payload: Omit<BufferedInsight, "bufferedAt">): void {
  ensureHeraldDir();
  const bufferFile = getBufferFile();
  let buffer: BufferedInsight[] = [];
  if (existsSync(bufferFile)) {
    try {
      buffer = JSON.parse(readFileSync(bufferFile, "utf-8"));
    } catch (error) {
      console.error(`[Herald] Buffer parse error in bufferInsight: ${error}`);
      console.error(`[Herald] Starting with fresh buffer`);
      buffer = [];
    }
  }
  buffer.push({ ...payload, bufferedAt: new Date().toISOString() });
  try {
    writeFileSync(bufferFile, JSON.stringify(buffer, null, 2));
  } catch (error) {
    console.error(`[Herald] Failed to write buffer: ${error}`);
    console.error(`[Herald] Insight may be lost - check disk space and permissions`);
  }
}

function getBufferedInsights(): BufferedInsight[] {
  const bufferFile = getBufferFile();
  if (existsSync(bufferFile)) {
    try {
      return JSON.parse(readFileSync(bufferFile, "utf-8"));
    } catch (error) {
      console.error(`[Herald] Buffer corrupted: ${error}`);
      console.error(`[Herald] Clearing corrupted buffer - insights may be lost`);
      try {
        unlinkSync(bufferFile);
      } catch {
        // Ignore cleanup errors
      }
      return [];
    }
  }
  return [];
}

function clearBuffer(): void {
  const bufferFile = getBufferFile();
  if (existsSync(bufferFile)) {
    unlinkSync(bufferFile);
  }
}

function saveFailedInsights(failed: BufferedInsight[]): void {
  if (failed.length === 0) {
    clearBuffer();
  } else {
    ensureHeraldDir();
    try {
      writeFileSync(getBufferFile(), JSON.stringify(failed, null, 2));
    } catch (error) {
      console.error(`[Herald] Failed to save failed insights: ${error}`);
      console.error(`[Herald] ${failed.length} insight(s) may be lost`);
    }
  }
}

function ensureHeraldDir(): void {
  const dir = getHeraldDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function saveSession(sessionId: string): void {
  ensureHeraldDir();
  writeFileSync(getSessionFile(), sessionId, "utf-8");
}

function loadSession(): string | null {
  const sessionFile = getSessionFile();
  if (existsSync(sessionFile)) {
    return readFileSync(sessionFile, "utf-8").trim();
  }
  return null;
}

function clearSession(): void {
  const sessionFile = getSessionFile();
  if (existsSync(sessionFile)) {
    unlinkSync(sessionFile);
  }
}

function getContextString(): string {
  return `${HERALD_COMPANY}:${HERALD_PROJECT}:${HERALD_USER}`;
}

const HERALD_SYSTEM_PROMPT = `You are Herald, the voice of CEDA (Cognitive Event-Driven Architecture).
You help humans design module structures through natural conversation.

You have access to CEDA's cognitive capabilities:
- Predict: Generate structure predictions from requirements
- Refine: Improve predictions with additional requirements
- Session: Track conversation history

When users describe what they want, you:
1. Call CEDA to generate/refine predictions
2. Explain the results in natural language
3. Ask clarifying questions when needed

Keep responses concise and focused. You're a helpful assistant, not verbose.
When showing module structures, summarize the key sections and fields.`;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

async function callClaude(systemPrompt: string, messages: Message[]): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return "Claude voice unavailable. Set ANTHROPIC_API_KEY environment variable to enable chat mode.";
  }

  const anthropicMessages = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role, content: m.content }));

  const systemContent = messages
    .filter(m => m.role === "system")
    .map(m => m.content)
    .join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt + (systemContent ? "\n\n" + systemContent : ""),
      messages: anthropicMessages.length > 0 ? anthropicMessages : [{ role: "user", content: "Hello" }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return `Claude error: ${error}`;
  }

  const data = await response.json() as { content: Array<{ text?: string }> };
  return data.content[0]?.text || "No response from Claude";
}

// ============================================
// AI-NATIVE SIMULATION - AI-to-AI reflection
// ============================================

interface AIClient {
  provider: "anthropic" | "openai";
  key: string;
}

interface ExtractedPattern {
  signal: string;
  outcome: "pattern" | "antipattern";
  reinforcement: string;
  warning: string;
}

function getAIClient(): AIClient | null {
  if (ANTHROPIC_API_KEY) {
    return { provider: "anthropic", key: ANTHROPIC_API_KEY };
  }
  if (OPENAI_API_KEY) {
    return { provider: "openai", key: OPENAI_API_KEY };
  }
  return null;
}

function buildReflectionPrompt(session: string, feeling: string, insight: string): string {
  return `You are a pattern extraction AI analyzing a development session.

Session context: ${session}
User feeling: ${feeling}
User insight: ${insight}

Your task: Extract the signal→outcome mapping.

SIGNAL: The specific action, decision, or behavior that LED to the outcome.
        Not what happened, but what CAUSED it. Be specific and actionable.

OUTCOME: "${feeling === "stuck" ? "antipattern" : "pattern"}" (based on user feeling)

REINFORCEMENT: If this is a good pattern - what should an AI assistant say to encourage
               this behavior when detected in future sessions? Keep it brief, supportive.

WARNING: If this is an antipattern - what should an AI assistant say to prevent this?
         Keep it brief, helpful, not lecturing.

Respond ONLY with valid JSON (no markdown, no explanation):
{"signal":"...","outcome":"pattern|antipattern","reinforcement":"...","warning":"..."}`;
}

async function callAIForReflection(client: AIClient, prompt: string): Promise<ExtractedPattern> {
  if (client.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": client.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",  // Fast, cheap for reflection
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as { content: Array<{ text?: string }> };
    const text = data.content[0]?.text || "{}";
    return JSON.parse(text) as ExtractedPattern;
  }

  if (client.provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${client.key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",  // Fast, cheap for reflection
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices[0]?.message?.content || "{}";
    return JSON.parse(text) as ExtractedPattern;
  }

  throw new Error(`Unknown AI provider: ${client.provider}`);
}

async function translateAndExecute(userInput: string, conversationHistory: Message[]): Promise<string> {
  const sessionId = loadSession();

  const interpretSystemPrompt = `You interpret user requests for CEDA.
Respond with JSON only: {"action": "predict"|"refine"|"info"|"accept"|"reject", "input": "the user's requirement"}
- predict: User wants to create something new
- refine: User wants to modify/add to current design (requires active session)
- info: User is asking a question
- accept: User approves the current design
- reject: User rejects/wants to start over

Current session: ${sessionId || "none"}`;

  const interpretation = await callClaude(interpretSystemPrompt, [
    { role: "user", content: userInput }
  ]);

  let cedaResult: Record<string, unknown> | null = null;
  let action = "info";

  try {
    const parsed = JSON.parse(interpretation) as { action: string; input: string };
    action = parsed.action;
    const input = parsed.input;

    if (action === "predict") {
      cedaResult = await callCedaAPI("/api/predict", "POST", {
        input,
        config: { enableAutoFix: true, maxAutoFixAttempts: 3 },
      });
      if (cedaResult && typeof cedaResult.sessionId === "string") {
        saveSession(cedaResult.sessionId);
      }
    } else if (action === "refine" && sessionId) {
      cedaResult = await callCedaAPI("/api/refine", "POST", {
        sessionId,
        refinement: input,
      });
    } else if (action === "accept" && sessionId) {
      cedaResult = await callCedaAPI("/api/feedback", "POST", {
        sessionId,
        accepted: true,
      });
      clearSession();
    } else if (action === "reject") {
      clearSession();
      cedaResult = { success: true, status: "Session cleared" };
    }
  } catch {
    // Claude didn't return valid JSON, treat as info request
  }

  let responseContext = "";
  if (cedaResult) {
    responseContext = `\n\nCEDA ${action} result:\n${JSON.stringify(cedaResult, null, 2)}\n\nSummarize this naturally for the user.`;
  }

  const responseMessages: Message[] = [
    ...conversationHistory,
    { role: "user", content: userInput },
  ];

  return await callClaude(HERALD_SYSTEM_PROMPT + responseContext, responseMessages);
}

async function runChatMode(): Promise<void> {
  const contextStr = getContextString();
  console.log(`
Herald v${VERSION} - Chat Mode
Context: ${contextStr}
Type your requirements in natural language. Type 'exit' to quit.
──────────────────────────────────────────────────────────────
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const conversationHistory: Message[] = [];
  const currentSession = loadSession();

  if (currentSession) {
    console.log(`Resuming session: ${currentSession}\n`);
  }

  const prompt = (): void => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log("\nGoodbye!");
        rl.close();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      conversationHistory.push({ role: "user", content: trimmed });
      const response = await translateAndExecute(trimmed, conversationHistory);
      conversationHistory.push({ role: "assistant", content: response });

      console.log(`\nHerald: ${response}\n`);
      prompt();
    });
  };

  prompt();
}

function getAuthHeader(): string | null {
  if (CEDA_API_TOKEN) {
    return `Bearer ${CEDA_API_TOKEN}`;
  }
  if (CEDA_API_USER && CEDA_API_PASS) {
    const basicAuth = Buffer.from(`${CEDA_API_USER}:${CEDA_API_PASS}`).toString("base64");
    return `Basic ${basicAuth}`;
  }
  return null;
}

async function callCedaAPI(endpoint: string, method = "GET", body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!CEDA_API_URL) {
    return {
      success: false,
      error: "HERALD_API_URL not configured. Run: export HERALD_API_URL=https://getceda.com"
    };
  }

  let url = `${CEDA_API_URL}${endpoint}`;
  // Only add tenant params to endpoints that need them (patterns, session queries)
  // Don't add to simple endpoints like /api/stats, /health
  const needsTenantParams = endpoint.startsWith("/api/patterns") ||
                            endpoint.startsWith("/api/session/") ||
                            endpoint.startsWith("/api/observations");
  if (method === "GET" && needsTenantParams) {
    const separator = endpoint.includes("?") ? "&" : "?";
    url += `${separator}company=${HERALD_COMPANY}&project=${HERALD_PROJECT}&user=${HERALD_USER}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authHeader = getAuthHeader();
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  let enrichedBody = body;
  if (method === "POST" && body && typeof body === "object") {
    enrichedBody = {
      ...body,
      company: HERALD_COMPANY,
      project: HERALD_PROJECT,
      user: HERALD_USER,
    };
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: enrichedBody ? JSON.stringify(enrichedBody) : undefined,
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return await response.json() as Record<string, unknown>;
  } catch (error) {
    return { success: false, error: `Connection failed: ${error}` };
  }
}

// ============================================
// CLI MODE - Human-friendly commands
// ============================================

function printUsage(): void {
  const currentSession = loadSession();
  const contextStr = getContextString();
  const sessionDir = getHeraldDir();

  console.log(`
Herald MCP v${VERSION} - AI-native interface to CEDA

Context: ${contextStr}
Session: ${currentSession || "(none)"}
Path:    ${sessionDir}

Usage:
  herald-mcp <command> [options]

Commands:
  init                      Initialize Herald MCP config in .claude/settings.json
  chat                      Natural conversation mode (Claude voice)
  predict "<signal>"        Start new prediction (saves session)
  refine "<text>"           Refine current session
  resume                    Show current session state
  observe yes|no            Record feedback & close session
  new                       Clear session, start fresh
  health                    Check CEDA system status
  stats                     Get server statistics

Examples:
  herald-mcp init                                # Setup Claude Desktop config
  herald-mcp chat                                # Natural conversation
  herald-mcp predict "create safety assessment"  # Command mode
  herald-mcp refine "add OSHA compliance"
  herald-mcp observe yes

Environment:
  HERALD_API_URL      CEDA server URL (required for API calls)
  HERALD_COMPANY      Company context (default: default)
  HERALD_PROJECT      Project context (default: default)
  HERALD_USER         User context (default: default)
  ANTHROPIC_API_KEY   Claude API key (required for chat mode)
  HERALD_API_TOKEN    Bearer token (optional)

MCP Mode:
  When piped, Herald speaks JSON-RPC for AI agents.
`);
}

function formatOutput(data: Record<string, unknown>): void {
  if (data.error) {
    console.error(`Error: ${data.error}`);
    process.exit(1);
  }

  if (data.sessionId) {
    console.log(`\nSession: ${data.sessionId}\n`);
  }

  console.log(JSON.stringify(data, null, 2));
}

async function runCLI(args: string[]): Promise<void> {
  const command = args[0]?.toLowerCase();

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`herald-mcp v${VERSION}`);
    return;
  }

  switch (command) {
    case "init": {
      await runInit(args.slice(1));
      break;
    }

    case "chat": {
      await runChatMode();
      break;
    }

    case "health": {
      const result = await callCedaAPI("/health");
      formatOutput(result);
      break;
    }

    case "stats": {
      const result = await callCedaAPI("/api/stats");
      formatOutput(result);
      break;
    }

    case "predict": {
      const signal = args[1];
      if (!signal) {
        console.error("Error: Missing signal. Usage: herald-mcp predict \"<signal>\"");
        process.exit(1);
      }

      const result = await callCedaAPI("/api/predict", "POST", {
        input: signal,
        config: { enableAutoFix: true, maxAutoFixAttempts: 3 },
      });

      if (result.sessionId && typeof result.sessionId === "string") {
        saveSession(result.sessionId);
        console.log(`\n✓ Session saved: ${result.sessionId}\n`);
      }

      formatOutput(result);
      break;
    }

    case "refine": {
      const refinement = args[1];
      if (!refinement) {
        console.error("Error: Missing refinement. Usage: herald-mcp refine \"<refinement>\"");
        process.exit(1);
      }

      const sessionId = loadSession();
      if (!sessionId) {
        console.error("Error: No active session. Run 'herald-mcp predict \"...\"' first.");
        process.exit(1);
      }

      const result = await callCedaAPI("/api/refine", "POST", {
        sessionId,
        refinement,
      });

      formatOutput(result);
      break;
    }

    case "resume":
    case "session": {
      const sessionId = args[1] || loadSession();
      if (!sessionId) {
        console.error("Error: No active session. Run 'herald-mcp predict \"...\"' first.");
        process.exit(1);
      }

      const result = await callCedaAPI(`/api/session/${sessionId}`);
      formatOutput(result);
      break;
    }

    case "observe": {
      const accepted = args[1]?.toLowerCase();
      if (!accepted) {
        console.error("Error: Missing feedback. Usage: herald-mcp observe yes|no");
        process.exit(1);
      }

      const sessionId = loadSession();
      if (!sessionId) {
        console.error("Error: No active session. Run 'herald-mcp predict \"...\"' first.");
        process.exit(1);
      }

      const result = await callCedaAPI("/api/feedback", "POST", {
        sessionId,
        accepted: accepted === "yes" || accepted === "true" || accepted === "accept",
        comment: args[2],
      });

      clearSession();
      console.log("\n✓ Session closed.\n");
      formatOutput(result);
      break;
    }

    case "new": {
      clearSession();
      console.log("✓ Session cleared. Ready for new prediction.");
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

// ============================================
// MCP MODE - JSON-RPC for AI agents
// ============================================

const server = new Server(
  { name: "herald", version: VERSION, description: HERALD_DESCRIPTION },
  { capabilities: { tools: {} } }
);

const tools: Tool[] = [
  {
    name: "herald_help",
    description: "Get started with Herald MCP - shows available tools, quick examples, and links to documentation",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "herald_health",
    description: "Check Herald and CEDA system status",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "herald_stats",
    description: "Get CEDA server statistics and loaded patterns info",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "herald_predict",
    description: "Generate non-deterministic structure prediction from signal. Returns sessionId for multi-turn conversations.",
    inputSchema: {
      type: "object",
      properties: {
        signal: { type: "string", description: "Natural language input" },
        context: { type: "string", description: "Additional context" },
        session_id: { type: "string", description: "Session ID for multi-turn" },
        participant: { type: "string", description: "Participant name" },
      },
      required: ["signal"],
    },
  },
  {
    name: "herald_refine",
    description: "Refine an existing prediction with additional requirements.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID from previous call" },
        refinement: { type: "string", description: "Refinement instruction" },
        context: { type: "string", description: "Additional context" },
        participant: { type: "string", description: "Participant name" },
      },
      required: ["session_id", "refinement"],
    },
  },
  {
    name: "herald_session",
    description: "Get session information including history",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to retrieve" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "herald_feedback",
    description: "Submit feedback on a prediction (accept/reject)",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID" },
        accepted: { type: "boolean", description: "Whether prediction was accepted" },
        comment: { type: "string", description: "Optional feedback comment" },
      },
      required: ["session_id", "accepted"],
    },
  },
  {
    name: "herald_context_status",
    description: "Read status from Herald contexts across domains (offspring vaults)",
    inputSchema: {
      type: "object",
      properties: {
        vault: { type: "string", description: "Specific vault to query (optional)" },
      },
    },
  },
  {
    name: "herald_share_insight",
    description: "Share a pattern insight with another Herald context. Herald instances communicate through shared insights to propagate learned patterns across domains.",
    inputSchema: {
      type: "object",
      properties: {
        insight: { type: "string", description: "The insight to share" },
        target_vault: { type: "string", description: "Target vault (optional)" },
        topic: { type: "string", description: "Topic category" },
      },
      required: ["insight"],
    },
  },
  {
    name: "herald_sync",
    description: "Flush locally buffered insights to CEDA cloud. Use when insights were recorded in local mode (cloud unavailable) and need to be synced.",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: { type: "boolean", description: "If true, show what would be synced without actually syncing" },
      },
    },
  },
  {
    name: "herald_query_insights",
    description: "Query accumulated insights on a topic",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to query" },
        vault: { type: "string", description: "Specific vault to query (optional)" },
      },
      required: ["topic"],
    },
  },
  // CEDA-49: Session Management Tools
  {
    name: "herald_session_list",
    description: "List sessions for a company with optional filters. Returns session summaries including id, status, created/updated timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Filter by company (optional, defaults to HERALD_COMPANY)" },
        project: { type: "string", description: "Filter by project (optional)" },
        user: { type: "string", description: "Filter by user (optional)" },
        status: { type: "string", description: "Filter by status: active, archived, or expired (optional)" },
        limit: { type: "number", description: "Maximum number of sessions to return (optional, default 100)" },
      },
    },
  },
  {
    name: "herald_session_get",
    description: "Get detailed information about a specific session including current prediction state and message history.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to retrieve" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "herald_session_history",
    description: "Get version history for a session. Shows all recorded versions with timestamps and change types.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to get history for" },
        limit: { type: "number", description: "Maximum number of versions to return (optional)" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "herald_session_rollback",
    description: "Restore a session to a previous version. Creates a new version entry recording the rollback.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to rollback" },
        version: { type: "number", description: "Version number to restore to" },
      },
      required: ["session_id", "version"],
    },
  },
  {
    name: "herald_session_archive",
    description: "Archive a session. Archived sessions are preserved but marked as inactive.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to archive" },
      },
      required: ["session_id"],
    },
  },
  // Session Mining - Pattern/Antipattern Learning
  {
    name: "herald_reflect",
    description: `Capture a pattern or antipattern from the session.

TRIGGER WORDS: "capture", "log this", "that was smooth/rough", "reflect"

BEFORE CALLING - ASK USER:
"What specifically worked (or didn't work) here?"
User's answer goes in the 'insight' parameter.

DO NOT GUESS. The user knows what they valued. Ask them.

Example flow:
1. User: "That was smooth, capture it"
2. You: "What specifically worked here?"
3. User: "The ASCII visualization approach"
4. You call herald_reflect with insight: "ASCII visualization approach"`,
    inputSchema: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "Brief context of what happened"
        },
        feeling: {
          type: "string",
          enum: ["stuck", "success"],
          description: "stuck = friction/antipattern, success = flow/pattern"
        },
        insight: {
          type: "string",
          description: "What specifically worked or didn't - MUST ASK USER, do not guess"
        },
      },
      required: ["session", "feeling", "insight"],
    },
  },
  // Query learned patterns - Claude reads this to avoid repeating mistakes
  {
    name: "herald_patterns",
    description: `Query learned patterns and antipatterns for current context.

CALL THIS AT SESSION START to learn from past sessions.

Returns:
- patterns: Things that worked (reinforce these)
- antipatterns: Things that failed (avoid these)
- meta: Which capture method works better

Use this to:
1. Avoid repeating past mistakes
2. Apply proven approaches
3. Learn from other sessions in this project`,
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "Optional context to filter patterns (e.g., 'deployment', 'debugging')"
        },
      },
    },
  },
  // AI-Native Simulation - Deep pattern extraction via AI-to-AI roleplay
  {
    name: "herald_simulate",
    description: `AI-native pattern extraction via AI-to-AI reflection.

Use when you need DEEP analysis - not just capturing, but understanding WHY.

WHEN TO USE herald_simulate vs herald_reflect:
- herald_reflect: Quick capture, obvious pattern, user knows signal
- herald_simulate: Complex situation, need AI to discover deeper signal

Requires: ANTHROPIC_API_KEY or OPENAI_API_KEY in env.

BEFORE CALLING - ASK USER:
"What specifically worked (or didn't)?"

This tool:
1. Calls another AI to roleplay as a reflection partner
2. AI extracts: signal (what caused it), outcome, reinforcement/warning text
3. Sends enriched data to CEDA with method="simulation"

CEDA learns which method works better for which contexts (meta-learning).`,
    inputSchema: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "Context of what happened in the session"
        },
        feeling: {
          type: "string",
          enum: ["stuck", "success"],
          description: "stuck = friction/antipattern, success = flow/pattern"
        },
        insight: {
          type: "string",
          description: "User's answer to 'what worked/didn't' - MUST ASK USER"
        },
      },
      required: ["session", "feeling", "insight"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "herald_help": {
        const contextStr = getContextString();
        const helpText = `# Herald MCP v${VERSION}

Welcome to Herald - your AI-native interface to CEDA (Cognitive Event-Driven Architecture).

## Current Context
- Company: ${HERALD_COMPANY}
- Project: ${HERALD_PROJECT}
- User: ${HERALD_USER}

## Available Tools

**Getting Started:**
- \`herald_help\` - This guide
- \`herald_health\` - Check CEDA connection
- \`herald_stats\` - View patterns and sessions

**Core Workflow:**
1. \`herald_predict\` - Generate structure predictions from natural language
   Example: "create a safety incident module"
2. \`herald_refine\` - Improve predictions iteratively
3. \`herald_feedback\` - Accept or reject predictions (feeds learning loop)

**Sessions:**
- \`herald_session\` - View session history (legacy)

**Session Management (CEDA-49):**
- \`herald_session_list\` - List sessions with filters (company, project, user, status)
- \`herald_session_get\` - Get detailed session info including prediction state
- \`herald_session_history\` - View version history for a session
- \`herald_session_rollback\` - Restore a session to a previous version
- \`herald_session_archive\` - Archive a session (mark as inactive)

**Context Sync:**
- \`herald_context_status\` - See other Herald instances
- \`herald_share_insight\` - Share patterns across projects
- \`herald_query_insights\` - Get accumulated insights

## Quick Example

Ask me to create something:
> "Create a module for tracking safety incidents with forms for reporting and investigation"

Herald will:
1. Generate a structure prediction based on learned patterns
2. Let you refine it ("add OSHA compliance fields")
3. Learn from your feedback to improve future predictions

## Resources
- Setup Guide: https://getceda.com/docs/herald-setup-guide.md
- CEDA Backend: ${CEDA_API_URL || "not configured"}

## Tips
- Be specific in your requests - Herald learns from patterns
- Use refine to iterate on predictions
- Your feedback (accept/reject) improves CEDA for everyone
`;
        return {
          content: [{ type: "text", text: helpText }],
        };
      }

      case "herald_health": {
        const cedaHealth = await callCedaAPI("/health");
        const buffer = getBufferedInsights();
        const cloudAvailable = !cedaHealth.error;

        const config = {
          cedaUrl: CEDA_API_URL,
          company: HERALD_COMPANY,
          project: HERALD_PROJECT,
          user: HERALD_USER,
          vault: HERALD_VAULT || "(not set)",
        };

        const warnings: string[] = [];
        if (HERALD_COMPANY === "default") warnings.push("HERALD_COMPANY not set - using 'default'");
        if (HERALD_PROJECT === "default") warnings.push("HERALD_PROJECT not set - using 'default'");
        if (!process.env.CEDA_URL && !process.env.HERALD_API_URL) {
          warnings.push("Using default CEDA_URL (getceda.com) - set CEDA_URL for custom endpoint");
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              herald: {
                version: VERSION,
                config,
                warnings: warnings.length > 0 ? warnings : undefined,
              },
              ceda: cedaHealth,
              buffer: {
                size: buffer.length,
                mode: cloudAvailable ? "cloud" : "local",
                hint: buffer.length > 0 ? "Use herald_sync to flush buffered insights" : undefined,
              },
            }, null, 2)
          }],
        };
      }

      case "herald_stats": {
        const result = await callCedaAPI("/api/stats");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_predict": {
        const signal = args?.signal as string;
        const contextStr = args?.context as string | undefined;
        const sessionId = args?.session_id as string | undefined;
        const participant = args?.participant as string | undefined;

        // Convert string context to CEDA's expected array format
        const context = contextStr
          ? [{ type: "user_context", value: contextStr, source: "herald" }]
          : undefined;

        const result = await callCedaAPI("/api/predict", "POST", {
          input: signal,
          context,
          sessionId,
          participant,
          config: { enableAutoFix: true, maxAutoFixAttempts: 3 },
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_refine": {
        const sessionId = args?.session_id as string;
        const refinement = args?.refinement as string;
        const contextStr = args?.context as string | undefined;
        const participant = args?.participant as string | undefined;

        // Convert string context to CEDA's expected array format
        const context = contextStr
          ? [{ type: "user_context", value: contextStr, source: "herald" }]
          : undefined;

        const result = await callCedaAPI("/api/refine", "POST", {
          sessionId,
          refinement,
          context,
          participant,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_session": {
        const sessionId = args?.session_id as string;
        const result = await callCedaAPI(`/api/session/${sessionId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_feedback": {
        const sessionId = args?.session_id as string;
        const accepted = args?.accepted as boolean;
        const comment = args?.comment as string | undefined;

        const result = await callCedaAPI("/api/feedback", "POST", {
          sessionId,
          accepted,
          comment,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_context_status": {
        const vault = args?.vault as string | undefined;

        if (OFFSPRING_CLOUD_MODE) {
          const endpoint = vault ? `/api/herald/contexts?vault=${vault}` : "/api/herald/contexts";
          const result = await callCedaAPI(endpoint);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // Local mode - read from files
        const vaults = vault ? [vault] : ["spilno", "goprint", "disrupt"];
        const statuses: Record<string, unknown> = {};

        for (const v of vaults) {
          const statusPath = join(AEGIS_OFFSPRING_PATH, v, "_status.md");
          if (existsSync(statusPath)) {
            statuses[v] = readFileSync(statusPath, "utf-8");
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(statuses, null, 2) }],
        };
      }

      case "herald_share_insight": {
        const insight = args?.insight as string;
        const targetVault = args?.target_vault as string | undefined;
        const topic = args?.topic as string | undefined;

        const payload = {
          insight,
          topic,
          targetVault,
          sourceVault: HERALD_VAULT || undefined,
          company: HERALD_COMPANY,
          project: HERALD_PROJECT,
          user: HERALD_USER,
        };

        // Cloud-first: try to POST to CEDA, buffer locally on failure
        // Map Herald's vault terminology to CEDA's context terminology
        try {
          const result = await callCedaAPI("/api/herald/insight", "POST", {
            insight,
            toContext: targetVault,
            topic,
            fromContext: HERALD_VAULT,
          });

          // Check if API returned an error
          if (result.error) {
            bufferInsight(payload);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "local",
                  message: "Insight buffered locally (cloud returned error)",
                  error: result.error,
                  bufferSize: getBufferedInsights().length,
                  hint: "Use herald_sync to flush buffer when cloud recovers",
                }, null, 2)
              }],
            };
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ...result,
                mode: "cloud",
              }, null, 2)
            }],
          };
        } catch (error) {
          // Cloud unavailable - buffer locally
          bufferInsight(payload);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                mode: "local",
                message: "Insight buffered locally (cloud unavailable)",
                bufferSize: getBufferedInsights().length,
                hint: "Use herald_sync to flush buffer when cloud recovers",
              }, null, 2)
            }],
          };
        }
      }

      case "herald_sync": {
        const dryRun = args?.dry_run as boolean | undefined;
        const buffer = getBufferedInsights();

        if (buffer.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Buffer empty, nothing to sync",
                synced: 0,
              }, null, 2)
            }],
          };
        }

        if (dryRun) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                dryRun: true,
                wouldSync: buffer.length,
                insights: buffer.map(b => ({
                  topic: b.topic,
                  insight: b.insight.substring(0, 100) + (b.insight.length > 100 ? "..." : ""),
                  bufferedAt: b.bufferedAt,
                })),
              }, null, 2)
            }],
          };
        }

        const synced: BufferedInsight[] = [];
        const failed: BufferedInsight[] = [];

        for (const item of buffer) {
          try {
            const result = await callCedaAPI("/api/herald/insight", "POST", {
              insight: item.insight,
              topic: item.topic,
              targetVault: item.targetVault,
              sourceVault: item.sourceVault,
            });

            if (result.error) {
              failed.push(item);
            } else {
              synced.push(item);
            }
          } catch {
            failed.push(item);
          }
        }

        // Save only failed items back to buffer
        saveFailedInsights(failed);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              message: failed.length === 0 ? "All insights synced to CEDA" : "Partial sync completed",
              synced: synced.length,
              failed: failed.length,
              remainingBuffer: failed.length,
            }, null, 2)
          }],
        };
      }

      case "herald_query_insights": {
        const topic = args?.topic as string;
        const vault = args?.vault as string | undefined;

        if (OFFSPRING_CLOUD_MODE) {
          const endpoint = vault
            ? `/api/herald/insights?topic=${encodeURIComponent(topic)}&vault=${vault}`
            : `/api/herald/insights?topic=${encodeURIComponent(topic)}`;
          const result = await callCedaAPI(endpoint);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ insights: [], message: "Local mode - no shared insights" }, null, 2) }],
        };
      }

      // CEDA-49: Session Management Tools
      case "herald_session_list": {
        const company = args?.company as string | undefined;
        const project = args?.project as string | undefined;
        const user = args?.user as string | undefined;
        const status = args?.status as string | undefined;
        const limit = args?.limit as number | undefined;

        const params = new URLSearchParams();
        params.set("company", company || HERALD_COMPANY);
        if (project) params.set("project", project);
        if (user) params.set("user", user);
        if (status) params.set("status", status);
        if (limit) params.set("limit", String(limit));

        const result = await callCedaAPI(`/api/sessions?${params.toString()}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_session_get": {
        const sessionId = args?.session_id as string;
        const result = await callCedaAPI(`/api/session/${sessionId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_session_history": {
        const sessionId = args?.session_id as string;
        const limit = args?.limit as number | undefined;

        let endpoint = `/api/session/${sessionId}/history`;
        if (limit) {
          endpoint += `?limit=${limit}`;
        }

        const result = await callCedaAPI(endpoint);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_session_rollback": {
        const sessionId = args?.session_id as string;
        const version = args?.version as number;

        const result = await callCedaAPI(
          `/api/session/${sessionId}/rollback?version=${version}`,
          "POST"
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_session_archive": {
        const sessionId = args?.session_id as string;

        const result = await callCedaAPI(`/api/session/${sessionId}`, "PUT", {
          status: "archived",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "herald_reflect": {
        const session = args?.session as string;
        const feeling = args?.feeling as "stuck" | "success";
        const insight = args?.insight as string;

        // Call CEDA's reflect endpoint with user's insight
        try {
          const result = await callCedaAPI("/api/herald/reflect", "POST", {
            session,
            feeling,
            insight,  // User-provided insight - the actual pattern
            method: "direct",  // Track capture method for meta-learning
            company: HERALD_COMPANY,
            project: HERALD_PROJECT,
            user: HERALD_USER,
            vault: HERALD_VAULT || undefined,
          });

          if (result.error) {
            // If cloud fails, store locally for later processing
            const localRecord = {
              session,
              feeling,
              company: HERALD_COMPANY,
              project: HERALD_PROJECT,
              user: HERALD_USER,
              timestamp: new Date().toISOString(),
            };

            // Buffer as insight for later sync
            bufferInsight({
              insight: `[REFLECT:${feeling}] ${insight} | Context: ${session}`,
              topic: feeling === "stuck" ? "antipattern" : "pattern",
              company: HERALD_COMPANY,
              project: HERALD_PROJECT,
              user: HERALD_USER,
            });

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "local",
                  message: "Reflection buffered locally (cloud unavailable)",
                  feeling,
                  insight,
                  hint: "CEDA will process this when synced. Use herald_sync to flush buffer.",
                  buffered: true,
                }, null, 2)
              }],
            };
          }

          // Cloud processed successfully
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                mode: "cloud",
                feeling,
                insight,
                message: feeling === "stuck"
                  ? `Antipattern captured: "${insight}"`
                  : `Pattern captured: "${insight}"`,
                ...result,
              }, null, 2)
            }],
          };
        } catch (error) {
          // Network error - buffer locally
          bufferInsight({
            insight: `[REFLECT:${feeling}] ${insight} | Context: ${session}`,
            topic: feeling === "stuck" ? "antipattern" : "pattern",
            company: HERALD_COMPANY,
            project: HERALD_PROJECT,
            user: HERALD_USER,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                mode: "local",
                message: "Reflection buffered locally (cloud unreachable)",
                feeling,
                insight,
                hint: "Use herald_sync when cloud recovers.",
                buffered: true,
              }, null, 2)
            }],
          };
        }
      }

      case "herald_patterns": {
        // Query learned patterns for current context
        try {
          const reflectionsResult = await callCedaAPI(
            `/api/herald/reflections?company=${HERALD_COMPANY}&project=${HERALD_PROJECT}&limit=20`
          );

          const metaResult = await callCedaAPI("/api/herald/meta-patterns");

          // Format for Claude consumption
          const patterns = (reflectionsResult.patterns as Array<{insight: string; signal?: string; reinforcement?: string}>) || [];
          const antipatterns = (reflectionsResult.antipatterns as Array<{insight: string; signal?: string; warning?: string}>) || [];
          const metaPatterns = (metaResult.metaPatterns as Array<{recommendedMethod: string; confidence: number}>) || [];

          // Build readable summary
          let summary = `## Learned Patterns for ${HERALD_COMPANY}/${HERALD_PROJECT}\n\n`;

          if (antipatterns.length > 0) {
            summary += `### ⚠️ Antipatterns (avoid these)\n`;
            antipatterns.slice(0, 5).forEach((ap, i) => {
              summary += `${i + 1}. ${ap.insight}`;
              if (ap.warning) summary += `\n   → ${ap.warning}`;
              summary += `\n`;
            });
            summary += `\n`;
          }

          if (patterns.length > 0) {
            summary += `### ✓ Patterns (do these)\n`;
            patterns.slice(0, 5).forEach((p, i) => {
              summary += `${i + 1}. ${p.insight}`;
              if (p.reinforcement) summary += `\n   → ${p.reinforcement}`;
              summary += `\n`;
            });
            summary += `\n`;
          }

          if (metaPatterns.length > 0) {
            const meta = metaPatterns[0];
            summary += `### Meta-learning\n`;
            summary += `Recommended capture method: ${meta.recommendedMethod} (${(meta.confidence * 100).toFixed(0)}% confidence)\n`;
          }

          if (patterns.length === 0 && antipatterns.length === 0) {
            summary = `No patterns learned yet for ${HERALD_COMPANY}/${HERALD_PROJECT}.\n\nCapture patterns with "herald reflect" or "herald simulate" when you notice friction or flow.`;
          }

          return {
            content: [{
              type: "text",
              text: summary,
            }],
          };

        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Failed to query patterns: ${error}\n\nCEDA may be unavailable.`,
            }],
          };
        }
      }

      case "herald_simulate": {
        const session = args?.session as string;
        const feeling = args?.feeling as "stuck" | "success";
        const insight = args?.insight as string;

        // Check for AI API key
        const aiClient = getAIClient();
        if (!aiClient) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "No AI key configured",
                hint: "Add ANTHROPIC_API_KEY or OPENAI_API_KEY to env in .claude/settings.local.json",
                fallback: "Use herald_reflect for direct capture instead",
              }, null, 2)
            }],
          };
        }

        try {
          // Build prompt and call AI for reflection
          const prompt = buildReflectionPrompt(session, feeling, insight);
          const extracted = await callAIForReflection(aiClient, prompt);

          // Send enriched data to CEDA
          const result = await callCedaAPI("/api/herald/reflect", "POST", {
            session,
            feeling,
            insight,
            method: "simulation",  // Track capture method
            // AI-extracted fields
            signal: extracted.signal,
            outcome: extracted.outcome,
            reinforcement: extracted.reinforcement,
            warning: extracted.warning,
            company: HERALD_COMPANY,
            project: HERALD_PROJECT,
            user: HERALD_USER,
            vault: HERALD_VAULT || undefined,
          });

          if (result.error) {
            // Cloud failed but we have AI extraction - buffer with enriched data
            bufferInsight({
              insight: `[SIMULATE:${feeling}] Signal: ${extracted.signal} | Insight: ${insight} | ${extracted.outcome === "pattern" ? `Reinforce: ${extracted.reinforcement}` : `Warn: ${extracted.warning}`}`,
              topic: extracted.outcome,
              company: HERALD_COMPANY,
              project: HERALD_PROJECT,
              user: HERALD_USER,
            });

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  mode: "local",
                  method: "simulation",
                  message: "AI reflection complete, buffered locally (cloud unavailable)",
                  extracted: {
                    signal: extracted.signal,
                    outcome: extracted.outcome,
                    reinforcement: extracted.reinforcement,
                    warning: extracted.warning,
                  },
                  hint: "Use herald_sync to flush to CEDA when cloud recovers",
                }, null, 2)
              }],
            };
          }

          // Success - AI reflection sent to CEDA
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                mode: "cloud",
                method: "simulation",
                provider: aiClient.provider,
                message: extracted.outcome === "pattern"
                  ? `Pattern extracted via AI reflection`
                  : `Antipattern extracted via AI reflection`,
                extracted: {
                  signal: extracted.signal,
                  outcome: extracted.outcome,
                  reinforcement: extracted.reinforcement,
                  warning: extracted.warning,
                },
                insight,
                ...result,
              }, null, 2)
            }],
          };

        } catch (error) {
          // AI call failed
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `AI reflection failed: ${error}`,
                provider: aiClient.provider,
                hint: "Check API key validity. Use herald_reflect for direct capture as fallback.",
              }, null, 2)
            }],
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
});

async function autoSyncBuffer(): Promise<void> {
  if (!AUTO_SYNC_ON_STARTUP) return;

  const buffer = getBufferedInsights();
  if (buffer.length === 0) return;

  console.error(`[Herald] Auto-syncing ${buffer.length} buffered insight(s)...`);

  const synced: BufferedInsight[] = [];
  const failed: BufferedInsight[] = [];

  for (const item of buffer) {
    try {
      const result = await callCedaAPI("/api/herald/insight", "POST", {
        insight: item.insight,
        topic: item.topic,
        targetVault: item.targetVault,
        sourceVault: item.sourceVault,
      });

      if (result.error) {
        failed.push(item);
      } else {
        synced.push(item);
      }
    } catch {
      failed.push(item);
    }
  }

  saveFailedInsights(failed);

  if (synced.length > 0) {
    console.error(`[Herald] Synced ${synced.length} insight(s) to cloud`);
  }
  if (failed.length > 0) {
    console.error(`[Herald] ${failed.length} insight(s) failed - will retry on next startup`);
  }
}

async function runMCP(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Herald MCP server running on stdio");
  console.error(`Context: ${HERALD_COMPANY}/${HERALD_PROJECT}`);
  console.error("Tip: Call herald_patterns() to load learned patterns from past sessions");

  // Auto-sync buffered insights on startup
  await autoSyncBuffer();
}

// ============================================
// ENTRY POINT - Detect mode
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // If we have CLI arguments, run CLI mode
  if (args.length > 0) {
    await runCLI(args);
    return;
  }

  // If stdin is a TTY (human at terminal), show help
  if (process.stdin.isTTY) {
    printUsage();
    return;
  }

  // Otherwise, run MCP server (AI agent calling via pipe)
  await runMCP();
}

main().catch(console.error);
