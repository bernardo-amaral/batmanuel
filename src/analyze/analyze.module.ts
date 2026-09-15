import { Module } from '@nestjs/common';
import { AnalyzeService } from './analyze.service';
import { EnginesModule } from '../engines/engines.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [EnginesModule, RulesModule],
  providers: [AnalyzeService],
})
export class AnalyzeModule {}
