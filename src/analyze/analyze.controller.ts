import { Controller, Post, Body, UseGuards, Get, Param } from '@nestjs/common';
// import { TokenGuard } from '../auth/token.guard';
import { AnalyzeRequestDto } from './dto/analyze-request.dto';
import { AnalyzeService } from './analyze.service';

@Controller()
// @UseGuards(TokenGuard)
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post('analyze')
  analyze(@Body() dto: AnalyzeRequestDto) {
    return this.analyzeService.analyze(dto);
  }

  @Get('projects/:id/summary')
  summary(@Param('id') id: string) {
    return this.analyzeService.getSummary(id);
  }
}
