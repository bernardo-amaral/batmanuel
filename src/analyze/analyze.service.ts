import { Injectable } from '@nestjs/common';
import { AnalysisReport } from './interfaces/analysis-report.interface';
import { Issue } from './interfaces/issue.interface';
import { DuplicationService } from '../engines/duplication.service';
import { RulesService } from '../rules/rules.service';
import { DependencyScannerService } from '../engines/dependency-scanner.service';
import { SecurityService } from '../engines/security.service';

export interface AnalyzeOptions {
  projectId: string;
  branch?: string;
  commit?: string;
  sourcePath?: string;
}

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly duplicationService: DuplicationService,
    private readonly dependencyScannerService: DependencyScannerService,
    private readonly securityService: SecurityService,
    private readonly rulesService: RulesService,
  ) {}

  /**
   *
   * @param dto
   * @returns
   */
  async analyze(options: AnalyzeOptions): Promise<AnalysisReport> {
    const branch = options.branch || undefined;
    const commit = options.commit || undefined;
    const sourcePath = options.sourcePath || '.';

    return this.runAnalysis({
      projectId: options.projectId,
      branch,
      commit,
      sourcePath,
    });
  }

  /**
   *
   * @param params
   * @returns
   */
  private async runAnalysis(params: {
    projectId: string;
    branch?: string;
    commit?: string;
    sourcePath: string;
  }): Promise<AnalysisReport> {
    const duplicationResult = await this.duplicationService.analyzeDirectory(
      params.sourcePath,
    );

    const securityIssues = await this.securityService.analyze(
      params.sourcePath,
    );

    const duplicationIssues: Issue[] = duplicationResult.duplicates.map(
      (block) => ({
        engine: 'duplication-service',
        type: 'quality',
        severity: block.lines >= 15 ? 'high' : 'medium',
        ruleId: 'duplicate-code',
        message: `Duplicated block found between ${block.firstFile}:${block.firstFileStart} and ${block.secondFile}:${block.secondFileStart}`,
        file: block.secondFile,
        line: block.secondFileStart,
      }),
    );

    const dependencyIssues: Issue[] =
      await this.dependencyScannerService.scanPackageJson(params.sourcePath);

    const issues: Issue[] = [
      ...duplicationIssues,
      ...securityIssues,
      ...dependencyIssues,
    ];

    const evaluation = this.rulesService.evaluate(
      duplicationResult.duplicationPercentage,
      issues,
    );

    return {
      projectId: params.projectId,
      branch: params?.branch || undefined,
      commit: params?.commit || undefined,
      timestamp: new Date().toISOString(),
      score: evaluation.score,
      passed: evaluation.passed,
      threshold: evaluation.threshold,
      metrics: {
        securityCritical: evaluation.breakdown.issuesBySeverity.critical ?? 0,
        securityHigh: evaluation.breakdown.issuesBySeverity.high ?? 0,
        securityMedium: evaluation.breakdown.issuesBySeverity.medium ?? 0,
        qualitySmells: evaluation?.qualitySmellsCount ?? 0,
        duplications: duplicationResult.duplicates.length,
        outdatedDeps: dependencyIssues.length,
      },
      totalFilesAnalyzed: duplicationResult.totalFiles,
      issues,
    };
  }
}
