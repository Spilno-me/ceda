export enum IntentType {
  CREATE = 'create',
  MODIFY = 'modify',
  QUERY = 'query',
  VALIDATE = 'validate',
  DELETE = 'delete',
}

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  domain?: string;
  entities: string[];
}

export interface ContextSignal {
  type: string;
  value: unknown;
  source: string;
  timestamp: Date;
}

export interface ProcessedSignal {
  intentClassification: IntentClassification;
  contextSignals: ContextSignal[];
  anomalies: Anomaly[];
  routingDecision: HandlerRoute;
}

export interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface HandlerRoute {
  handler: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

/** Tenant context for multi-tenant pattern isolation */
export interface TenantContext {
  /** Company identifier */
  company?: string;
  /** Project identifier */
  project?: string;
  /** User identifier */
  user?: string;
}
