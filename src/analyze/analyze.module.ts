import { Module } from '@nestjs/common';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';
import { AuthModule } from '../auth/auth.module';
import { EnginesModule } from '../engines/engines.module';
import { DuplicationService } from '../engines/duplication.service';
import { RulesService } from '../rules/rules.service';
import { RulesModule } from '../rules/rules.module';
import { DependencyScannerService } from '../engines/dependency-scanner.service';

@Module({
  imports: [AuthModule, EnginesModule, RulesModule],
  controllers: [AnalyzeController],
  providers: [
    AnalyzeService,
    DuplicationService,
    RulesService,
    DependencyScannerService,
  ],
})
export class AnalyzeModule {}
