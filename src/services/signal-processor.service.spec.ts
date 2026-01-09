import { Test, TestingModule } from '@nestjs/testing';
import { SignalProcessorService } from './signal-processor.service';
import { IntentType } from '../interfaces';

describe('SignalProcessorService', () => {
  let service: SignalProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignalProcessorService],
    }).compile();

    service = module.get<SignalProcessorService>(SignalProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('classifyIntent', () => {
    it('should classify CREATE intent', () => {
      const result = service.classifyIntent('create a new safety assessment');
      expect(result.intent).toBe(IntentType.CREATE);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify QUERY intent', () => {
      const result = service.classifyIntent('show me all incidents from last week');
      expect(result.intent).toBe(IntentType.QUERY);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify MODIFY intent', () => {
      const result = service.classifyIntent('update the permit status');
      expect(result.intent).toBe(IntentType.MODIFY);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify VALIDATE intent', () => {
      const result = service.classifyIntent('verify the compliance report');
      expect(result.intent).toBe(IntentType.VALIDATE);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should classify DELETE intent', () => {
      const result = service.classifyIntent('delete the old incident record');
      expect(result.intent).toBe(IntentType.DELETE);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect domain from input', () => {
      const result = service.classifyIntent('create a new safety incident report');
      expect(result.domain).toBe('safety');
    });

    it('should extract entities from input', () => {
      const result = service.classifyIntent('create a new incident report');
      expect(result.entities).toContain('incident');
      expect(result.entities).toContain('report');
    });

    it('should handle ambiguous input with lower confidence', () => {
      const result = service.classifyIntent('hello');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  describe('detectContextSignals', () => {
    it('should detect domain hints from input', () => {
      const result = service.detectContextSignals('show me safety incidents');
      const domainSignal = result.find(s => s.type === 'domain_hint');
      expect(domainSignal).toBeDefined();
      expect(domainSignal?.value).toBe('safety');
    });

    it('should detect time constraints', () => {
      const result = service.detectContextSignals('show incidents from last week');
      const timeSignal = result.find(s => s.type === 'time_constraint');
      expect(timeSignal).toBeDefined();
      expect(timeSignal?.value).toBe('last week');
    });

    it('should detect urgency signals', () => {
      const result = service.detectContextSignals('urgent: create incident report immediately');
      const urgencySignal = result.find(s => s.type === 'urgency');
      expect(urgencySignal).toBeDefined();
      expect(urgencySignal?.value).toBe('critical');
    });

    it('should include context from environment', () => {
      const context = {
        currentModule: 'safety-module',
        userRole: 'admin',
      };
      const result = service.detectContextSignals('create report', context);
      const moduleSignal = result.find(s => s.type === 'module_context');
      const roleSignal = result.find(s => s.type === 'user_role');
      expect(moduleSignal?.value).toBe('safety-module');
      expect(roleSignal?.value).toBe('admin');
    });

    it('should return empty array for input with no signals', () => {
      const result = service.detectContextSignals('hello world');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect low confidence anomaly', () => {
      const classification = {
        intent: IntentType.QUERY,
        confidence: 0.3,
        entities: [],
      };
      const result = service.detectAnomalies('test', classification);
      const lowConfidenceAnomaly = result.find(a => a.type === 'low_confidence');
      expect(lowConfidenceAnomaly).toBeDefined();
      expect(lowConfidenceAnomaly?.severity).toBe('medium');
    });

    it('should detect missing entities for non-query intents', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.8,
        entities: [],
      };
      const result = service.detectAnomalies('create something', classification);
      const missingEntitiesAnomaly = result.find(a => a.type === 'missing_entities');
      expect(missingEntitiesAnomaly).toBeDefined();
    });

    it('should detect insufficient input', () => {
      const classification = {
        intent: IntentType.QUERY,
        confidence: 0.5,
        entities: [],
      };
      const result = service.detectAnomalies('hi', classification);
      const insufficientAnomaly = result.find(a => a.type === 'insufficient_input');
      expect(insufficientAnomaly).toBeDefined();
    });

    it('should detect conflicting intents', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.6,
        entities: ['report'],
      };
      const result = service.detectAnomalies('create and delete the report', classification);
      const conflictingAnomaly = result.find(a => a.type === 'conflicting_intents');
      expect(conflictingAnomaly).toBeDefined();
    });

    it('should return empty array for clean input', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.9,
        entities: ['incident', 'report'],
      };
      const result = service.detectAnomalies(
        'create a new incident report for the safety department',
        classification,
      );
      expect(result.length).toBe(0);
    });
  });

  describe('routeSignal', () => {
    it('should route CREATE intent to creation-handler', () => {
      const classification = {
        intent: IntentType.CREATE,
        confidence: 0.8,
        entities: ['report'],
      };
      const result = service.routeSignal(classification);
      expect(result.handler).toBe('creation-handler');
      expect(result.priority).toBe(1);
    });

    it('should route QUERY intent to query-handler', () => {
      const classification = {
        intent: IntentType.QUERY,
        confidence: 0.7,
        entities: [],
      };
      const result = service.routeSignal(classification);
      expect(result.handler).toBe('query-handler');
      expect(result.priority).toBe(3);
    });

    it('should include metadata in routing decision', () => {
      const classification = {
        intent: IntentType.MODIFY,
        confidence: 0.85,
        domain: 'safety',
        entities: ['incident'],
      };
      const result = service.routeSignal(classification);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.confidence).toBe(0.85);
      expect(result.metadata?.domain).toBe('safety');
    });
  });

  describe('processSignal', () => {
    it('should return complete ProcessedSignal', () => {
      const result = service.processSignal('create new incident report');
      expect(result).toHaveProperty('intentClassification');
      expect(result).toHaveProperty('contextSignals');
      expect(result).toHaveProperty('anomalies');
      expect(result).toHaveProperty('routingDecision');
    });

    it('should process signal with context', () => {
      const context = {
        currentModule: 'safety',
        userRole: 'manager',
      };
      const result = service.processSignal('show all incidents', context);
      expect(result.intentClassification.intent).toBe(IntentType.QUERY);
      expect(result.contextSignals.length).toBeGreaterThan(0);
    });

    it('should correctly chain all processing steps', () => {
      const result = service.processSignal('urgent: create safety assessment immediately');
      expect(result.intentClassification.intent).toBe(IntentType.CREATE);
      expect(result.intentClassification.domain).toBe('safety');
      const urgencySignal = result.contextSignals.find(s => s.type === 'urgency');
      expect(urgencySignal?.value).toBe('critical');
      expect(result.routingDecision.handler).toBe('creation-handler');
    });
  });
});
