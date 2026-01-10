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
import { PatternLibraryService } from '../services/pattern-library.service';
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
