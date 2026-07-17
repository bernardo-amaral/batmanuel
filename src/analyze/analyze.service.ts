/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AnalysisReport } from './interfaces/analysis-report.interface';
import { Issue } from './interfaces/issue.interface';
import { DuplicationService } from '../engines/duplication.service';
import { RulesService } from '../rules/rules.service';
import { AnalyzeUploadRequestDto } from './dto/analyze-upload-request.dto';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { DependencyScannerService } from '../engines/dependency-scanner.service';

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly duplicationService: DuplicationService,
    private readonly dependencyScannerService: DependencyScannerService,
    private readonly rulesService: RulesService,
  ) {}

  /**
   *
   * @param dto
   * @returns
   */
  async analyze(dto: AnalyzeRequestDto): Promise<AnalysisReport> {
    const branch = dto?.branch || undefined;
    const commit = dto?.commit || undefined;
    const sourcePath = dto.sourcePath;

    return this.runAnalysis({
      projectId: dto.projectId,
      branch,
      commit,
      sourcePath,
    });
  }

  /**
   *
   * @param dto
   * @param file
   * @returns
   */
  async analyzeUploadedRepository(
    dto: AnalyzeUploadRequestDto,
    file: Express.Multer.File,
  ): Promise<AnalysisReport> {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only ZIP files are supported.');
    }

    const tempRoot = mkdtempSync(path.join(tmpdir(), 'batmanuel-'));
    const zipPath = path.join(tempRoot, file.originalname);
    const extractPath = path.join(tempRoot, 'repo');

    try {
      writeFileSync(zipPath, file.buffer);

      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractPath, true);

      const sourcePath = this.resolveSourceDirectory(extractPath);

      return await this.runAnalysis({
        projectId: dto.projectId,
        branch: dto.branch,
        commit: dto.commit,
        sourcePath,
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Failed to process uploaded ZIP file.',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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

    const issues: Issue[] = [...duplicationIssues, ...dependencyIssues];

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
        qualitySmells: 0,
        duplications: duplicationResult.duplicates.length,
        outdatedDeps: dependencyIssues.length,
      },
      totalFilesAnalyzed: duplicationResult.totalFiles,
      issues,
    };
  }

  /**
   *
   * @param projectId
   * @returns
   */
  getSummary(projectId: string) {
    return {
      projectId,
      lastScore: 0,
      trend: [],
      lastAnalysisAt: new Date().toISOString(),
    };
  }

  /**
   *
   * @param extractPath
   * @returns
   */
  private resolveSourceDirectory(extractPath: string): string {
    const srcPath = path.join(extractPath, 'src');
    return srcPath;
  }
}
