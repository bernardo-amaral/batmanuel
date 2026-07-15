import { Injectable } from '@nestjs/common';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AnalysisReport } from './interfaces/analysis-report.interface';
import { buildMockAnalysisReport } from './mocks/analysis-report.mock';
import {
  buildMockProjectSummary,
  ProjectSummary,
} from './mocks/project-summary.mock';

@Injectable()
export class AnalyzeService {
  analyze(dto: AnalyzeRequestDto): AnalysisReport {
    const branch = dto.branch ?? 'main';
    const commit = dto.commit ?? 'mock-commit-sha';
    return buildMockAnalysisReport(dto.projectId, branch, commit);
  }

  getSummary(projectId: string): ProjectSummary {
    return buildMockProjectSummary(projectId);
  }
}
