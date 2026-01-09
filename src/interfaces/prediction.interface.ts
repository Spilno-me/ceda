export interface StructurePrediction {
  moduleType: string;
  sections: SectionPrediction[];
  confidence: number;
  rationale: string;
  alternatives: StructurePrediction[];
}

export interface SectionPrediction {
  name: string;
  fields: FieldPrediction[];
  order: number;
}

export interface FieldPrediction {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  validations?: string[];
}

export interface WorkflowPrediction {
  workflowType: string;
  steps: WorkflowStep[];
  confidence: number;
}

export interface WorkflowStep {
  name: string;
  type: string;
  assignee?: string;
  conditions?: string[];
}

export interface ConfidenceScore {
  overall: number;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  score: number;
  weight: number;
}
