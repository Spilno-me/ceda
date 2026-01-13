/**
 * CEDA-52: Anomaly Detection Interfaces
 *
 * Types for detecting suspicious patterns in CEDA usage.
 * Note: Named DetectedAnomaly to avoid conflict with signal.interface.ts Anomaly
 */

export enum AnomalyType {
  BURST_CREATION = 'BURST_CREATION',
  LOW_QUALITY_FLOOD = 'LOW_QUALITY_FLOOD',
  DUPLICATE_SPAM = 'DUPLICATE_SPAM',
}

export type AnomalySeverity = 'low' | 'medium' | 'high';

export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved';

export interface DetectedAnomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  entityType: string;
  entityId: string;
  company: string;
  description: string;
  evidence: AnomalyEvidence[];
  detectedAt: Date;
  status: AnomalyStatus;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface AnomalyEvidence {
  type: string;
  value: unknown;
  timestamp?: Date;
}

export interface DetectionResult {
  anomaliesDetected: DetectedAnomaly[];
  scannedEntities: number;
  company: string;
  timestamp: Date;
}

export interface AnomalyFilter {
  company?: string;
  type?: AnomalyType;
  status?: AnomalyStatus;
  severity?: AnomalySeverity;
}
