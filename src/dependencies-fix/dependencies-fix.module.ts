import { Module } from '@nestjs/common';
import { EnginesModule } from '../engines/engines.module';
import { DependenciesFixService } from './dependencies-fix.service';
import { PackageJsonService } from './package-json.service';

@Module({
  imports: [EnginesModule],
  providers: [DependenciesFixService, PackageJsonService],
  exports: [DependenciesFixService],
})
export class DependenciesFixModule {}
