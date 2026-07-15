import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TokenGuard } from '../auth/token.guard';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AnalyzeService } from './analyze.service';

@ApiTags('analyze')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(TokenGuard)
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Run a code analysis for a given project/branch/commit (mock)',
  })
  @ApiResponse({
    status: 201,
    description: 'Analysis report generated successfully',
  })
  analyze(@Body() dto: AnalyzeRequestDto) {
    return this.analyzeService.analyze(dto);
  }

  @Get('projects/:id/summary')
  @ApiOperation({
    summary: 'Get historical score summary for a project (mock)',
  })
  @ApiParam({ name: 'id', example: 'sindigo-backend' })
  @ApiResponse({
    status: 200,
    description: 'Project summary retrieved successfully',
  })
  summary(@Param('id') id: string) {
    return this.analyzeService.getSummary(id);
  }
}
