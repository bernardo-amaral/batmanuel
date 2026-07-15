export interface ProjectSummary {
  projectId: string;
  lastScore: number;
  trend: number[];
  lastAnalysisAt: string;
}

export function buildMockProjectSummary(projectId: string): ProjectSummary {
  return {
    projectId,
    lastScore: 82,
    trend: [76, 78, 80, 82],
    lastAnalysisAt: new Date().toISOString(),
  };
}
