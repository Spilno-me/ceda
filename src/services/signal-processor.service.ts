import { Injectable, Logger } from '@nestjs/common';
import {
  IntentType,
  IntentClassification,
  ContextSignal,
  ProcessedSignal,
  Anomaly,
  HandlerRoute,
} from '../interfaces';

interface KeywordConfig {
  keywords: string[];
  weight: number;
}

@Injectable()
export class SignalProcessorService {
  private readonly logger = new Logger(SignalProcessorService.name);

  private readonly intentKeywords: Map<IntentType, KeywordConfig> = new Map([
    [
      IntentType.CREATE,
      {
        keywords: ['create', 'new', 'add', 'generate', 'make'],
        weight: 1.0,
      },
    ],
    [
      IntentType.MODIFY,
      {
        keywords: ['update', 'edit', 'change', 'modify', 'revise'],
        weight: 1.0,
      },
    ],
    [
      IntentType.QUERY,
      {
        keywords: ['show', 'list', 'find', 'get', 'search', 'display'],
        weight: 1.0,
      },
    ],
    [
      IntentType.VALIDATE,
      {
        keywords: ['check', 'verify', 'validate', 'review', 'approve'],
        weight: 1.0,
      },
    ],
    [
      IntentType.DELETE,
      {
        keywords: ['delete', 'remove', 'cancel', 'revoke'],
        weight: 1.0,
      },
    ],
  ]);

  private readonly domainPatterns: Map<string, RegExp[]> = new Map([
    // HSE domain patterns
    [
      'safety',
      [/safety/i, /incident/i, /hazard/i, /risk/i, /assessment/i, /inspection/i],
    ],
    ['permit', [/permit/i, /authorization/i, /approval/i, /clearance/i]],
    ['compliance', [/compliance/i, /audit/i, /regulation/i, /policy/i]],
    ['workflow', [/workflow/i, /process/i, /task/i, /assignment/i]],
    ['user', [/user/i, /account/i, /profile/i, /role/i, /permission/i]],
    // Design System domain patterns
    ['component', [/component/i, /button/i, /input/i, /card/i, /modal/i, /dialog/i, /form/i, /ui\b/i]],
    ['token', [/token/i, /color/i, /spacing/i, /typography/i, /scale/i, /theme/i]],
    ['accessibility', [/accessibility/i, /wcag/i, /a11y/i, /contrast/i, /aria/i, /screen.?reader/i]],
    ['pattern', [/pattern/i, /layout/i, /responsive/i, /navigation/i, /grid/i]],
    ['review', [/review/i, /analyze/i, /audit/i, /check/i, /validate/i, /mcp/i, /project/i]],
    // Anteater ecosystem patterns
    ['scaffold', [/scaffold/i, /design.?system/i, /generate.*project/i, /create.*ds/i, /npx\s+anteater/i, /anteater\s+\w+/i]],
    ['oklch', [/oklch/i, /color.?scale/i, /perceptual/i, /lightness/i, /chroma/i]],
    ['semantic', [/semantic/i, /alias/i, /mapping/i, /interactive/i, /primitive/i]],
    ['shadcn', [/shadcn/i, /add\s+(button|card|dialog|input)/i, /fetch.*component/i, /radix/i]],
    ['transform', [/transform/i, /convert/i, /map.*token/i, /replace/i]],
    ['claude', [/\.claude/i, /ai.?context/i, /agent.?context/i, /skills/i]],
    ['storybook', [/storybook/i, /story/i, /stories/i, /allstates/i]],
    ['hookify', [/hookify/i, /hook.*rule/i, /validation.*rule/i, /enforcement/i]],
    ['skill', [/skill/i, /workflow/i, /prompt/i, /reusable/i]],
    ['mcp', [/mcp/i, /model.?context/i, /tool.*definition/i, /server.*tool/i]],
    ['tailwind', [/tailwind/i, /preset/i, /utility/i, /tw\b/i]],
    ['audit', [/audit/i, /scan/i, /drift/i, /compliance/i]],
  ]);

  private readonly handlerMap: Map<IntentType, { handler: string; priority: number }> = new Map([
    [IntentType.CREATE, { handler: 'creation-handler', priority: 1 }],
    [IntentType.MODIFY, { handler: 'modification-handler', priority: 2 }],
    [IntentType.QUERY, { handler: 'query-handler', priority: 3 }],
    [IntentType.VALIDATE, { handler: 'validation-handler', priority: 2 }],
    [IntentType.DELETE, { handler: 'deletion-handler', priority: 1 }],
  ]);

  classifyIntent(input: string): IntentClassification {
    this.logger.debug(`Classifying intent for: ${input.substring(0, 50)}...`);

    const normalizedInput = input.toLowerCase();
    const words = normalizedInput.split(/\s+/);

    let bestIntent: IntentType = IntentType.QUERY;
    let bestScore = 0;

    for (const [intent, config] of this.intentKeywords) {
      let score = 0;
      let matchCount = 0;

      for (const keyword of config.keywords) {
        const keywordIndex = words.findIndex(word => word.includes(keyword));
        if (keywordIndex !== -1) {
          matchCount++;
          const positionBonus = 1 - keywordIndex / words.length;
          score += (1 + positionBonus * 0.5) * config.weight;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    const confidence = Math.min(bestScore / 2, 1);
    const domain = this.detectDomain(normalizedInput);
    const entities = this.extractEntities(normalizedInput);

    const result: IntentClassification = {
      intent: bestIntent,
      confidence: confidence > 0 ? confidence : 0.3,
      domain,
      entities,
    };

    this.logger.debug(`Intent classified: ${result.intent} (confidence: ${result.confidence})`);
    return result;
  }

  detectContextSignals(input: string, context?: Record<string, unknown>): ContextSignal[] {
    this.logger.debug('Detecting context signals...');

    const signals: ContextSignal[] = [];
    const now = new Date();

    const domain = this.detectDomain(input);
    if (domain) {
      signals.push({
        type: 'domain_hint',
        value: domain,
        source: 'input_analysis',
        timestamp: now,
      });
    }

    const timeConstraints = this.extractTimeConstraints(input);
    if (timeConstraints) {
      signals.push({
        type: 'time_constraint',
        value: timeConstraints,
        source: 'input_analysis',
        timestamp: now,
      });
    }

    const urgencyLevel = this.detectUrgency(input);
    if (urgencyLevel !== 'normal') {
      signals.push({
        type: 'urgency',
        value: urgencyLevel,
        source: 'input_analysis',
        timestamp: now,
      });
    }

    if (context) {
      if (context.currentModule) {
        signals.push({
          type: 'module_context',
          value: context.currentModule,
          source: 'environment',
          timestamp: now,
        });
      }

      if (context.userRole) {
        signals.push({
          type: 'user_role',
          value: context.userRole,
          source: 'environment',
          timestamp: now,
        });
      }

      if (context.location) {
        signals.push({
          type: 'location_context',
          value: context.location,
          source: 'environment',
          timestamp: now,
        });
      }
    }

    this.logger.debug(`Detected ${signals.length} context signals`);
    return signals;
  }

  detectAnomalies(input: string, classification: IntentClassification): Anomaly[] {
    this.logger.debug('Detecting anomalies...');

    const anomalies: Anomaly[] = [];

    if (classification.confidence < 0.5) {
      anomalies.push({
        type: 'low_confidence',
        severity: 'medium',
        description: `Intent classification confidence is low (${classification.confidence.toFixed(2)}). User intent may be ambiguous.`,
      });
    }

    const conflictingIntents = this.detectConflictingIntents(input);
    if (conflictingIntents.length > 1) {
      anomalies.push({
        type: 'conflicting_intents',
        severity: 'medium',
        description: `Multiple conflicting intents detected: ${conflictingIntents.join(', ')}`,
      });
    }

    if (classification.entities.length === 0 && classification.intent !== IntentType.QUERY) {
      anomalies.push({
        type: 'missing_entities',
        severity: 'low',
        description: 'No specific entities identified in the request. Additional context may be needed.',
      });
    }

    if (input.length < 10) {
      anomalies.push({
        type: 'insufficient_input',
        severity: 'low',
        description: 'Input is very short. More details may improve processing accuracy.',
      });
    }

    if (input.length > 1000) {
      anomalies.push({
        type: 'complex_input',
        severity: 'low',
        description: 'Input is lengthy. Consider breaking into smaller requests for better handling.',
      });
    }

    this.logger.debug(`Detected ${anomalies.length} anomalies`);
    return anomalies;
  }

  routeSignal(classification: IntentClassification): HandlerRoute {
    this.logger.debug(`Routing signal for intent: ${classification.intent}`);

    const handlerConfig = this.handlerMap.get(classification.intent);

    if (!handlerConfig) {
      return {
        handler: 'default-handler',
        priority: 5,
        metadata: {
          reason: 'no_specific_handler',
          originalIntent: classification.intent,
        },
      };
    }

    const route: HandlerRoute = {
      handler: handlerConfig.handler,
      priority: handlerConfig.priority,
      metadata: {
        confidence: classification.confidence,
        domain: classification.domain,
        entityCount: classification.entities.length,
      },
    };

    this.logger.debug(`Routed to handler: ${route.handler} (priority: ${route.priority})`);
    return route;
  }

  processSignal(input: string, context?: Record<string, unknown>): ProcessedSignal {
    this.logger.debug('Processing signal...');

    const intentClassification = this.classifyIntent(input);
    const contextSignals = this.detectContextSignals(input, context);
    const anomalies = this.detectAnomalies(input, intentClassification);
    const routingDecision = this.routeSignal(intentClassification);

    const result: ProcessedSignal = {
      intentClassification,
      contextSignals,
      anomalies,
      routingDecision,
    };

    this.logger.debug('Signal processing complete');
    return result;
  }

  private detectDomain(input: string): string | undefined {
    for (const [domain, patterns] of this.domainPatterns) {
      if (patterns.some(pattern => pattern.test(input))) {
        return domain;
      }
    }
    return undefined;
  }

  private extractEntities(input: string): string[] {
    const entities: string[] = [];

    const quotedMatches = input.match(/"([^"]+)"/g);
    if (quotedMatches) {
      entities.push(...quotedMatches.map(m => m.replace(/"/g, '')));
    }

    const domainTerms = [
      'incident',
      'permit',
      'assessment',
      'report',
      'user',
      'role',
      'workflow',
      'task',
      'inspection',
      'audit',
      'location',
      'site',
    ];

    const words = input.toLowerCase().split(/\s+/);
    for (const term of domainTerms) {
      if (words.includes(term)) {
        entities.push(term);
      }
    }

    return [...new Set(entities)];
  }

  private extractTimeConstraints(input: string): string | null {
    const timePatterns = [
      /last\s+(week|month|year|day)/i,
      /this\s+(week|month|year)/i,
      /today/i,
      /yesterday/i,
      /since\s+\w+/i,
      /before\s+\w+/i,
      /after\s+\w+/i,
      /\d{4}-\d{2}-\d{2}/,
    ];

    for (const pattern of timePatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  private detectUrgency(input: string): 'low' | 'normal' | 'high' | 'critical' {
    const criticalPatterns = [/urgent/i, /emergency/i, /critical/i, /immediately/i, /asap/i];
    const highPatterns = [/important/i, /priority/i, /soon/i, /quickly/i];
    const lowPatterns = [/whenever/i, /no rush/i, /when you can/i, /eventually/i];

    if (criticalPatterns.some(p => p.test(input))) {
      return 'critical';
    }
    if (highPatterns.some(p => p.test(input))) {
      return 'high';
    }
    if (lowPatterns.some(p => p.test(input))) {
      return 'low';
    }

    return 'normal';
  }

  private detectConflictingIntents(input: string): IntentType[] {
    const detectedIntents: IntentType[] = [];
    const normalizedInput = input.toLowerCase();

    for (const [intent, config] of this.intentKeywords) {
      const hasKeyword = config.keywords.some(keyword => normalizedInput.includes(keyword));
      if (hasKeyword) {
        detectedIntents.push(intent);
      }
    }

    return detectedIntents;
  }
}
