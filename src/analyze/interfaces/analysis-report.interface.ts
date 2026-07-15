import { AnalysisMetrics } from './analysis-metrics.interface';
import { Issue } from './issue.interface';

export interface AnalysisReport {
  projectId: string;
  branch: string;
  commit: string;
  timestamp: string;
  score: number;
  metrics: AnalysisMetrics;
  issues: Issue[];
}
