#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AnalyzeModule } from '../src/analyze/analyze.module';
import { AnalyzeService } from '../src/analyze/analyze.service';
import path from 'node:path';

async function main() {
  const args = process.argv.slice(2);
  const targetPath = args[0] ?? process.cwd();

  const projectId = path.basename(targetPath);

  const app = await NestFactory.createApplicationContext(AnalyzeModule, {
    logger: false,
  });

  const analyzeService = app.get(AnalyzeService);

  const result = await analyzeService.analyze({
    sourcePath: targetPath,
    projectId,
  });

  console.log(JSON.stringify(result, null, 2));

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
