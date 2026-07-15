import { AnalysisReport } from '../interfaces/analysis-report.interface';

// Fixture usada enquanto os engines reais (linters, SAST, scanners)
// ainda não estão implementados. Serve apenas para validar integração.
export function buildMockAnalysisReport(
  projectId: string,
  branch: string,
  commit: string,
): AnalysisReport {
  return {
    projectId,
    branch,
    commit,
    timestamp: new Date().toISOString(),
    score: 82,
    metrics: {
      securityCritical: 1,
      securityHigh: 2,
      securityMedium: 5,
      qualitySmells: 12,
      duplications: 3,
      outdatedDeps: 2,
    },
    issues: [
      {
        engine: 'mock-engine',
        type: 'security',
        severity: 'critical',
        ruleId: 'sql-injection',
        message: 'Possível SQL injection (exemplo mock)',
        file: 'src/users/users.service.ts',
        line: 42,
      },
      {
        engine: 'mock-engine',
        type: 'quality',
        severity: 'medium',
        ruleId: 'duplicate-code',
        message: 'Bloco de código duplicado (exemplo mock)',
        file: 'src/orders/orders.service.ts',
        line: 88,
      },
      {
        engine: 'mock-engine',
        type: 'dependency',
        severity: 'high',
        ruleId: 'outdated-lib',
        message: 'Dependência desatualizada com CVE conhecido (exemplo mock)',
        file: 'package.json',
        line: 1,
      },
    ],
  };
}
