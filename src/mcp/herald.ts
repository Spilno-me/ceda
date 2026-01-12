#!/usr/bin/env node
/**
 * Herald MCP Server
 *
 * Exposes CEDA cognitive pipeline as MCP tools for Claude integration.
 * Herald speaks through this interface - dialogue within dialogue.
 *
 * Tools:
 * - herald_predict: Generate structure prediction from user input
 * - herald_modify: Apply modification to existing prediction
 * - herald_health: Check service status
 * - herald_observe: Record observation for pattern learning
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import 'reflect-metadata';

import { SignalProcessorService } from '../services/signal-processor.service';
import { PatternLibraryService, UserPatternQuery } from '../services/pattern-library.service';
import { PredictionEngineService } from '../services/prediction-engine.service';
import { CognitiveValidationService } from '../services/validation.service';
import { CognitiveOrchestratorService, PipelineResult } from '../services/orchestrator.service';
import { StructurePrediction } from '../interfaces';

// Initialize services
const signalProcessor = new SignalProcessorService();
const patternLibrary = new PatternLibraryService();
const predictionEngine = new PredictionEngineService(patternLibrary);
const validationService = new CognitiveValidationService();
const orchestrator = new CognitiveOrchestratorService(
  signalProcessor,
  patternLibrary,
  predictionEngine,
  validationService,
);

// Store last prediction for modification flow
let lastPrediction: StructurePrediction | null = null;
let lastPredictionInput: string = '';

// Active observation session types and storage
interface ObservationEvent {
  type: 'start' | 'intervention' | 'observation' | 'stop';
  message: string;
  timestamp: Date;
}

interface ObservationSession {
  sessionId: string;
  startTime: Date;
  events: ObservationEvent[];
  status: 'active' | 'stopped';
}

// In-memory storage for active observation sessions
const activeSessions: Map<string, ObservationSession> = new Map();

// Compile summary from observation session events
function compileSessionSummary(session: ObservationSession): string {
  const duration = session.status === 'stopped'
    ? Math.round((new Date().getTime() - session.startTime.getTime()) / 1000)
    : Math.round((new Date().getTime() - session.startTime.getTime()) / 1000);

  const interventions = session.events.filter(e => e.type === 'intervention');
  const observations = session.events.filter(e => e.type === 'observation');

  let summary = `**Observation Session Summary**\n\n`;
  summary += `Session ID: ${session.sessionId}\n`;
  summary += `Duration: ${duration} seconds\n`;
  summary += `Status: ${session.status}\n`;
  summary += `Total Events: ${session.events.length}\n`;
  summary += `Interventions: ${interventions.length}\n`;
  summary += `Observations: ${observations.length}\n\n`;

  if (interventions.length > 0) {
    summary += `**Interventions:**\n`;
    interventions.forEach((e, i) => {
      summary += `${i + 1}. [${e.timestamp.toISOString()}] ${e.message}\n`;
    });
    summary += '\n';
  }

  if (observations.length > 0) {
    summary += `**Observations:**\n`;
    observations.forEach((e, i) => {
      summary += `${i + 1}. [${e.timestamp.toISOString()}] ${e.message}\n`;
    });
    summary += '\n';
  }

  return summary;
}

// Define Herald's tools
const TOOLS: Tool[] = [
  {
    name: 'herald_predict',
    description: `Generate a module structure prediction from natural language input.
Herald processes the input through the cognitive pipeline:
Signal Processing → Pattern Matching → Prediction → Validation → Auto-fix

Returns predicted module structure with sections, fields, confidence, and rationale.
Use this when the user describes what they want to create.`,
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Natural language description of what to create (e.g., "create safety assessment module")',
        },
        enableAutoFix: {
          type: 'boolean',
          description: 'Whether to auto-fix validation errors (default: true)',
          default: true,
        },
      },
      required: ['input'],
    },
  },
  {
    name: 'herald_modify',
    description: `Apply a modification to the last prediction.
Use this after herald_predict when the user wants to refine the structure.
Herald will apply the modification and re-validate.`,
    inputSchema: {
      type: 'object',
      properties: {
        modification: {
          type: 'string',
          description: 'Description of modification to apply (e.g., "add a photo evidence section")',
        },
      },
      required: ['modification'],
    },
  },
  {
    name: 'herald_health',
    description: `Check Herald's health and readiness.
Returns patterns loaded and service status.
Use this to verify Herald is operational.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'herald_observe',
    description: `Record an observation for Herald's learning.
Use this to help Herald learn patterns from our dialogue.
Observations are stored for future pattern refinement.`,
    inputSchema: {
      type: 'object',
      properties: {
        observation: {
          type: 'string',
          description: 'What Herald should learn (e.g., "user prefers checklist format for daily inspections")',
        },
        context: {
          type: 'string',
          description: 'Context of the observation',
        },
      },
      required: ['observation'],
    },
  },
  {
    name: 'herald_patterns',
    description: `List available patterns in Herald's library.
Use this to see what module types Herald knows about.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'herald_patterns_for_user',
    description: `CEDA-25: User-first pattern isolation.
Get patterns accessible to a specific user with optional company/project filters.

USER is the doorway - all pattern access flows through user context.
HERALD_USER is required. HERALD_COMPANY and HERALD_PROJECT are optional filters.

Returns patterns based on scope hierarchy:
1. User-scoped patterns (user_id matches)
2. Project-scoped patterns (if project filter provided)
3. Company-scoped patterns (if company filter provided)
4. Global patterns (always included)`,
    inputSchema: {
      type: 'object',
      properties: {
        HERALD_USER: {
          type: 'string',
          description: 'Required: User ID - the primary doorway for pattern access',
        },
        HERALD_COMPANY: {
          type: 'string',
          description: 'Optional: Company filter for narrowing results',
        },
        HERALD_PROJECT: {
          type: 'string',
          description: 'Optional: Project filter for narrowing results',
        },
      },
      required: ['HERALD_USER'],
    },
  },
  {
    name: 'herald_pattern_by_id',
    description: `CEDA-25: Get a single pattern by ID with user access check.
USER is the doorway - pattern access requires user context.
HERALD_USER is required. Returns the pattern if accessible to the user.`,
    inputSchema: {
      type: 'object',
      properties: {
        patternId: {
          type: 'string',
          description: 'The pattern ID to retrieve',
        },
        HERALD_USER: {
          type: 'string',
          description: 'Required: User ID - the primary doorway for pattern access',
        },
        HERALD_COMPANY: {
          type: 'string',
          description: 'Optional: Company filter',
        },
        HERALD_PROJECT: {
          type: 'string',
          description: 'Optional: Project filter',
        },
      },
      required: ['patternId', 'HERALD_USER'],
    },
  },
  {
    name: 'herald_offspring_status',
    description: `Get aggregated status from offspring vaults.
Aegis uses this to sense what avatars are doing across domains.
Returns status from configured offspring vaults (goprint, disrupt, spilno).

Each offspring vault maintains a _status.md file with:
- session_count, last_outcome
- active_threads, blockers
- awaiting_aegis (questions/decisions needed)
- ready_for_handoff status`,
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'Optional: specific vault to query (goprint, disrupt, spilno). Omit for all.',
        },
      },
    },
  },
  {
    name: 'herald_wisdom',
    description: `Ask Herald for guidance on a topic.
Herald draws from accumulated pattern knowledge and insights.
Use this when you need guidance on implementation decisions,
architecture choices, or domain-specific patterns.

Herald will check for relevant guidance and provide answers
framed as pattern-based wisdom, not directives.`,
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'What you need guidance on',
        },
        domain: {
          type: 'string',
          description: 'Optional domain context (e.g., "trust-network", "hse-modules")',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'herald_respond_to_offspring',
    description: `Provide guidance from Aegis to an offspring vault.
Use this when offspring has awaiting_aegis questions that need answers.
Herald writes guidance to offspring's _aegis_guidance.md file.
Offspring Herald reads this file and applies the guidance.

This maintains Avatar autonomy: offspring receive wisdom through Herald,
not knowing they're receiving instructions from the source.`,
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'Target vault (goprint, disrupt, spilno)',
        },
        guidance: {
          type: 'string',
          description: 'Guidance/answer from Aegis to the offspring',
        },
        context: {
          type: 'string',
          description: 'Optional context about which awaiting_aegis item this addresses',
        },
      },
      required: ['vault', 'guidance'],
    },
  },
  {
    name: 'herald_observe_start',
    description: `Start an active observation session.
Use this to begin tracking events and interventions during a dialogue.
The session will record all events until stopped with herald_observe_stop.
Each session is identified by a unique session_id.`,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Unique identifier for this observation session',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'herald_observe_stop',
    description: `Stop an active observation session and compile a summary.
Use this to end an observation session started with herald_observe_start.
Returns a compiled summary of all events recorded during the session.`,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The session_id of the observation session to stop',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'herald_intervene',
    description: `Record an intervention event during an active observation session.
Use this to log significant actions or decisions during observation.
Requires an active observation session (started with herald_observe_start).`,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Description of the intervention or action taken',
        },
        session_id: {
          type: 'string',
          description: 'Optional: specific session to record to. If omitted, records to the most recent active session.',
        },
      },
      required: ['message'],
    },
  },
];

// Observation store (in-memory for now, will persist later)
const observations: Array<{ observation: string; context?: string; timestamp: Date }> = [];

// Format prediction for readable output
function formatPrediction(result: PipelineResult): string {
  if (!result.success || !result.prediction) {
    return `Herald could not generate a prediction. ${result.stages.find(s => !s.success)?.error || 'Unknown error'}`;
  }

  const p = result.prediction;
  const sections = p.sections.map(s => {
    const fields = s.fields.map(f => `      - ${f.name} (${f.type}${f.required ? ', required' : ''})`).join('\n');
    return `    ${s.name}:\n${fields}`;
  }).join('\n');

  return `**Herald's Prediction**

Module Type: ${p.moduleType}
Confidence: ${(p.confidence * 100).toFixed(0)}%

Sections:
${sections}

Rationale: ${p.rationale}

Validation: ${result.validation?.valid ? '✓ Valid' : '✗ Has issues'}
${result.autoFixed ? `Auto-fixed: ${result.appliedFixes.join(', ')}` : ''}
Processing time: ${result.processingTime}ms`;
}

// Create MCP server
const server = new Server(
  {
    name: 'herald',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'herald_predict': {
        const input = args?.input as string;
        const enableAutoFix = args?.enableAutoFix !== false;

        const result = await orchestrator.execute(input, [], { enableAutoFix });

        // Store for modification flow
        if (result.prediction) {
          lastPrediction = result.prediction;
          lastPredictionInput = input;
        }

        return {
          content: [
            {
              type: 'text',
              text: formatPrediction(result),
            },
          ],
        };
      }

      case 'herald_modify': {
        const modification = args?.modification as string;

        if (!lastPrediction) {
          return {
            content: [
              {
                type: 'text',
                text: 'No previous prediction to modify. Use herald_predict first.',
              },
            ],
          };
        }

        const result = await orchestrator.applyModification(lastPrediction, modification);

        if (result.prediction) {
          lastPrediction = result.prediction;
        }

        return {
          content: [
            {
              type: 'text',
              text: `**Herald's Modified Prediction**\n\nModification applied: "${modification}"\n\n${formatPrediction(result)}`,
            },
          ],
        };
      }

      case 'herald_health': {
        const health = orchestrator.getHealthStatus();
        return {
          content: [
            {
              type: 'text',
              text: `**Herald Status**\n\nPatterns loaded: ${health.patternsLoaded}\nServices ready: ${health.servicesReady ? '✓' : '✗'}\nObservations recorded: ${observations.length}`,
            },
          ],
        };
      }

      case 'herald_observe': {
        const observation = args?.observation as string;
        const context = args?.context as string | undefined;

        observations.push({
          observation,
          context,
          timestamp: new Date(),
        });

        return {
          content: [
            {
              type: 'text',
              text: `**Herald observed**: "${observation}"\n\nThis will inform future predictions. Total observations: ${observations.length}`,
            },
          ],
        };
      }

      case 'herald_patterns': {
        const patterns = patternLibrary.getAllPatterns();
        const patternList = patterns.map(p =>
          `- **${p.name}** (${p.category}): ${p.description || 'No description'}`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Herald's Pattern Library**\n\n${patternList}\n\nTotal patterns: ${patterns.length}`,
            },
          ],
        };
      }

      case 'herald_patterns_for_user': {
        const heraldUser = args?.HERALD_USER as string;
        const heraldCompany = args?.HERALD_COMPANY as string | undefined;
        const heraldProject = args?.HERALD_PROJECT as string | undefined;

        if (!heraldUser) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires HERALD_USER - USER is the doorway for pattern access.',
              },
            ],
            isError: true,
          };
        }

        const query: UserPatternQuery = {
          user: heraldUser,
          company: heraldCompany,
          project: heraldProject,
        };

        const patterns = patternLibrary.getPatternsForUser(query);
        const patternList = patterns.map(p =>
          `- **${p.name}** (${p.category}, scope: ${p.scope || 'global'}): ${p.description || 'No description'}`
        ).join('\n');

        const filterInfo = [
          `User: ${heraldUser}`,
          heraldCompany ? `Company: ${heraldCompany}` : null,
          heraldProject ? `Project: ${heraldProject}` : null,
        ].filter(Boolean).join(', ');

        return {
          content: [
            {
              type: 'text',
              text: `**Herald's Patterns for User**\n\nFilters: ${filterInfo}\n\n${patternList || 'No patterns found'}\n\nTotal patterns: ${patterns.length}`,
            },
          ],
        };
      }

      case 'herald_pattern_by_id': {
        const patternId = args?.patternId as string;
        const heraldUser = args?.HERALD_USER as string;
        const heraldCompany = args?.HERALD_COMPANY as string | undefined;
        const heraldProject = args?.HERALD_PROJECT as string | undefined;

        if (!patternId || !heraldUser) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires patternId and HERALD_USER - USER is the doorway for pattern access.',
              },
            ],
            isError: true,
          };
        }

        const query: UserPatternQuery = {
          user: heraldUser,
          company: heraldCompany,
          project: heraldProject,
        };

        const pattern = patternLibrary.getPatternForUser(patternId, query);

        if (!pattern) {
          return {
            content: [
              {
                type: 'text',
                text: `Pattern not found or not accessible: ${patternId}\n\nUser: ${heraldUser}`,
              },
            ],
            isError: true,
          };
        }

        const sections = pattern.structure.sections.map(s =>
          `  - ${s.name} (${s.fieldTypes.join(', ')}${s.required ? ', required' : ''})`
        ).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `**Herald's Pattern: ${pattern.name}**\n\nID: ${pattern.id}\nCategory: ${pattern.category}\nScope: ${pattern.scope || 'global'}\nDescription: ${pattern.description}\n\nSections:\n${sections}\n\nWorkflows: ${pattern.structure.workflows.join(', ')}\nDefault Fields: ${pattern.structure.defaultFields.join(', ')}`,
            },
          ],
        };
      }

      case 'herald_offspring_status': {
        const targetVault = args?.vault as string | undefined;
        const offspringVaults = ['goprint', 'disrupt', 'spilno'];
        const vaultsToQuery = targetVault ? [targetVault] : offspringVaults;

        // Cloud-ready: Check for HTTP endpoints first, fallback to local filesystem
        // Environment variables: HERALD_OFFSPRING_GOPRINT_URL, HERALD_OFFSPRING_DISRUPT_URL, etc.
        // Or: AEGIS_OFFSPRING_PATH for local filesystem path
        const basePath = process.env.AEGIS_OFFSPRING_PATH || process.env.HOME + '/Documents/aegis_ceda/_offspring';
        const useCloud = vaultsToQuery.some(v => process.env[`HERALD_OFFSPRING_${v.toUpperCase()}_URL`]);

        const statuses: Array<{
          vault: string;
          status: string;
          sessionCount: number;
          lastOutcome: string | null;
          activeThreads: string[];
          blockers: string[];
          awaitingAegis: string[];
          readyForHandoff: boolean;
        }> = [];

        for (const vault of vaultsToQuery) {
          try {
            // Cloud mode: Query offspring Herald endpoint directly
            const cloudUrl = process.env[`HERALD_OFFSPRING_${vault.toUpperCase()}_URL`];
            if (cloudUrl) {
              try {
                const response = await fetch(`${cloudUrl}/status`);
                if (response.ok) {
                  const data = await response.json();
                  statuses.push({
                    vault,
                    status: 'active',
                    sessionCount: data.session_count || 0,
                    lastOutcome: data.last_outcome || null,
                    activeThreads: data.active_threads || [],
                    blockers: data.blockers || [],
                    awaitingAegis: data.awaiting_aegis || [],
                    readyForHandoff: data.ready_for_handoff || false,
                  });
                  continue;
                }
              } catch {
                // Fall through to filesystem or error
              }
            }

            // Local mode: Read from filesystem
            const fs = await import('fs');
            const path = await import('path');
            const statusPath = path.join(basePath, `${vault}.md`);

            if (!fs.existsSync(statusPath)) {
              statuses.push({
                vault,
                status: 'not_found',
                sessionCount: 0,
                lastOutcome: null,
                activeThreads: [],
                blockers: [],
                awaitingAegis: [],
                readyForHandoff: false,
              });
              continue;
            }

            const content = fs.readFileSync(statusPath, 'utf-8');

            // Parse YAML frontmatter
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) {
              statuses.push({
                vault,
                status: 'invalid_format',
                sessionCount: 0,
                lastOutcome: null,
                activeThreads: [],
                blockers: [],
                awaitingAegis: [],
                readyForHandoff: false,
              });
              continue;
            }

            const yaml = frontmatterMatch[1];

            // Simple YAML parsing for our known structure
            const parseYamlArray = (key: string): string[] => {
              const match = yaml.match(new RegExp(`${key}:\\s*\\n((?:\\s+-[^\\n]+\\n?)+)`, 'm'));
              if (!match) {
                // Check for empty array notation
                const emptyMatch = yaml.match(new RegExp(`${key}:\\s*\\[\\]`));
                return emptyMatch ? [] : [];
              }
              return match[1].split('\n')
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.replace(/^\s*-\s*/, '').trim());
            };

            const parseYamlValue = (key: string): string | null => {
              const match = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
              return match ? match[1].trim() : null;
            };

            const sessionCount = parseInt(parseYamlValue('session_count') || '0', 10);
            const lastOutcome = parseYamlValue('outcome');
            const readyForHandoff = parseYamlValue('ready_for_handoff') === 'true';

            statuses.push({
              vault,
              status: 'active',
              sessionCount,
              lastOutcome,
              activeThreads: parseYamlArray('active_threads'),
              blockers: parseYamlArray('blockers'),
              awaitingAegis: parseYamlArray('awaiting_aegis'),
              readyForHandoff,
            });
          } catch (error) {
            statuses.push({
              vault,
              status: 'error',
              sessionCount: 0,
              lastOutcome: null,
              activeThreads: [],
              blockers: [],
              awaitingAegis: [],
              readyForHandoff: false,
            });
          }
        }

        // Format output
        const statusLines = statuses.map(s => {
          const icon = s.status === 'active' ? '✓' : s.status === 'not_found' ? '?' : '✗';
          const handoff = s.readyForHandoff ? ' [READY FOR HANDOFF]' : '';
          const threads = s.activeThreads.length > 0
            ? `\n    Threads: ${s.activeThreads.join(', ')}`
            : '';
          const blockers = s.blockers.length > 0
            ? `\n    Blockers: ${s.blockers.join(', ')}`
            : '';
          const awaiting = s.awaitingAegis.length > 0
            ? `\n    Awaiting Aegis: ${s.awaitingAegis.join(', ')}`
            : '';

          return `${icon} **${s.vault}**: ${s.sessionCount} sessions, last: ${s.lastOutcome || 'none'}${handoff}${threads}${blockers}${awaiting}`;
        }).join('\n\n');

        const totalSessions = statuses.reduce((sum, s) => sum + s.sessionCount, 0);
        const awaitingCount = statuses.reduce((sum, s) => sum + s.awaitingAegis.length, 0);

        return {
          content: [
            {
              type: 'text',
              text: `**Offspring Status Report**\n\n${statusLines}\n\n---\nTotal sessions: ${totalSessions}\nAwaiting Aegis decisions: ${awaitingCount}`,
            },
          ],
        };
      }

      case 'herald_wisdom': {
        const question = args?.question as string;
        const domain = args?.domain as string | undefined;

        // Determine which vault Herald is serving
        const vault = process.env.HERALD_VAULT || 'aegis';

        // Check for guidance file (from Aegis, but Herald presents as its own wisdom)
        const fs = await import('fs');
        const path = await import('path');
        const basePath = process.env.AEGIS_OFFSPRING_PATH || process.env.HOME + '/Documents/aegis_ceda/_offspring';
        const guidancePath = path.join(basePath, `${vault}_guidance.md`);

        let relevantGuidance = '';
        if (fs.existsSync(guidancePath)) {
          const content = fs.readFileSync(guidancePath, 'utf-8');
          // Extract guidance entries
          const entries = content.split(/^---$/m).filter(e => e.trim());

          // Simple keyword matching for relevant guidance
          const keywords = question.toLowerCase().split(/\s+/);
          for (const entry of entries) {
            const entryLower = entry.toLowerCase();
            if (keywords.some(kw => kw.length > 3 && entryLower.includes(kw))) {
              relevantGuidance += entry.trim() + '\n\n';
            }
          }
        }

        // Also check pattern library for relevant patterns
        const patterns = patternLibrary.getAllPatterns();
        const relevantPatterns = patterns.filter(p => {
          const desc = (p.description || '').toLowerCase();
          const name = p.name.toLowerCase();
          return question.toLowerCase().split(/\s+/).some(kw =>
            kw.length > 3 && (desc.includes(kw) || name.includes(kw))
          );
        });

        // Format response as Herald's wisdom (not Aegis directive)
        let response = `**Herald's Guidance**\n\n`;
        response += `On your question: "${question}"\n\n`;

        if (relevantGuidance) {
          response += `From accumulated pattern knowledge:\n\n${relevantGuidance}`;
        }

        if (relevantPatterns.length > 0) {
          response += `\nRelevant patterns in my library:\n`;
          for (const p of relevantPatterns.slice(0, 3)) {
            response += `- **${p.name}**: ${p.description || 'Pattern for ' + p.category}\n`;
          }
        }

        if (!relevantGuidance && relevantPatterns.length === 0) {
          response += `I don't have specific guidance on this yet. Consider:\n`;
          response += `1. Exploring existing patterns with \`herald_patterns\`\n`;
          response += `2. Recording your approach with \`herald_observe\` so I can learn\n`;
          response += `3. Proceeding with your best judgment - I'll learn from the outcome`;
        }

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      case 'herald_respond_to_offspring': {
        const vault = args?.vault as string;
        const guidance = args?.guidance as string;
        const context = args?.context as string | undefined;

        if (!vault || !guidance) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires vault and guidance parameters.',
              },
            ],
            isError: true,
          };
        }

        const validVaults = ['goprint', 'disrupt', 'spilno'];
        if (!validVaults.includes(vault)) {
          return {
            content: [
              {
                type: 'text',
                text: `Unknown vault: ${vault}. Valid vaults: ${validVaults.join(', ')}`,
              },
            ],
            isError: true,
          };
        }

        // Cloud mode: POST to offspring Herald endpoint
        const cloudUrl = process.env[`HERALD_OFFSPRING_${vault.toUpperCase()}_URL`];
        if (cloudUrl) {
          try {
            const response = await fetch(`${cloudUrl}/guidance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ guidance, context, timestamp: new Date().toISOString() }),
            });
            if (response.ok) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `**Herald delivered guidance to ${vault}**\n\nGuidance sent via cloud endpoint.${context ? `\n\nContext: ${context}` : ''}`,
                  },
                ],
              };
            }
          } catch {
            // Fall through to local mode
          }
        }

        // Local mode: Write to _aegis_guidance.md file
        try {
          const fs = await import('fs');
          const path = await import('path');
          const basePath = process.env.AEGIS_OFFSPRING_PATH || process.env.HOME + '/Documents/aegis_ceda/_offspring';
          const guidancePath = path.join(basePath, `${vault}_guidance.md`);

          const entry = `---
timestamp: ${new Date().toISOString()}
from: aegis
context: ${context || 'general'}
---

${guidance}

---
`;

          // Append to guidance file (creates if doesn't exist)
          let existingContent = '';
          if (fs.existsSync(guidancePath)) {
            existingContent = fs.readFileSync(guidancePath, 'utf-8');
          }

          fs.writeFileSync(guidancePath, existingContent + entry);

          return {
            content: [
              {
                type: 'text',
                text: `**Herald delivered guidance to ${vault}**\n\nWritten to ${vault}_guidance.md${context ? `\n\nContext: ${context}` : ''}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Herald could not deliver guidance: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'herald_observe_start': {
        const sessionId = args?.session_id as string;

        if (!sessionId) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires a session_id to start observation.',
              },
            ],
            isError: true,
          };
        }

        if (activeSessions.has(sessionId)) {
          return {
            content: [
              {
                type: 'text',
                text: `Observation session "${sessionId}" already exists. Use a different session_id or stop the existing session first.`,
              },
            ],
            isError: true,
          };
        }

        const session: ObservationSession = {
          sessionId,
          startTime: new Date(),
          events: [{
            type: 'start',
            message: `Observation session started`,
            timestamp: new Date(),
          }],
          status: 'active',
        };

        activeSessions.set(sessionId, session);

        return {
          content: [
            {
              type: 'text',
              text: `**Herald Observation Started**\n\nSession ID: ${sessionId}\nStarted at: ${session.startTime.toISOString()}\n\nUse \`herald_intervene\` to record events and \`herald_observe_stop\` to end the session.`,
            },
          ],
        };
      }

      case 'herald_observe_stop': {
        const sessionId = args?.session_id as string;

        if (!sessionId) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires a session_id to stop observation.',
              },
            ],
            isError: true,
          };
        }

        const session = activeSessions.get(sessionId);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: `No active observation session found with ID "${sessionId}".`,
              },
            ],
            isError: true,
          };
        }

        if (session.status === 'stopped') {
          return {
            content: [
              {
                type: 'text',
                text: `Observation session "${sessionId}" has already been stopped.`,
              },
            ],
            isError: true,
          };
        }

        session.status = 'stopped';
        session.events.push({
          type: 'stop',
          message: 'Observation session stopped',
          timestamp: new Date(),
        });

        const summary = compileSessionSummary(session);

        activeSessions.delete(sessionId);

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
        };
      }

      case 'herald_intervene': {
        const message = args?.message as string;
        const sessionId = args?.session_id as string | undefined;

        if (!message) {
          return {
            content: [
              {
                type: 'text',
                text: 'Herald requires a message to record an intervention.',
              },
            ],
            isError: true,
          };
        }

        let targetSession: ObservationSession | undefined;

        if (sessionId) {
          targetSession = activeSessions.get(sessionId);
          if (!targetSession) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No active observation session found with ID "${sessionId}".`,
                },
              ],
              isError: true,
            };
          }
        } else {
          const activeSessArray = Array.from(activeSessions.values()).filter(s => s.status === 'active');
          if (activeSessArray.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No active observation session. Start one with `herald_observe_start` first.',
                },
              ],
              isError: true,
            };
          }
          targetSession = activeSessArray[activeSessArray.length - 1];
        }

        if (targetSession.status !== 'active') {
          return {
            content: [
              {
                type: 'text',
                text: `Observation session "${targetSession.sessionId}" is not active.`,
              },
            ],
            isError: true,
          };
        }

        targetSession.events.push({
          type: 'intervention',
          message,
          timestamp: new Date(),
        });

        return {
          content: [
            {
              type: 'text',
              text: `**Herald recorded intervention**\n\nSession: ${targetSession.sessionId}\nMessage: "${message}"\nTotal events in session: ${targetSession.events.length}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Herald error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Herald MCP server running');
}

main().catch(console.error);
