/**
 * Pipeline types for DMaker custom workflow steps
 */

export interface PipelineStep {
  id: string;
  name: string;
  order: number;
  instructions: string;
  colorClass: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
}

export type PipelineStatus = `pipeline_${string}`;

export type FeatureStatusWithPipeline =
  | 'local'
  | 'backlog'
  | 'planning'
  | 'in_progress'
  | 'building'
  | 'waiting_approval'
  | 'completed'
  | PipelineStatus;
