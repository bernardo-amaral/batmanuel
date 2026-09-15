#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { NestFactory } from '@nestjs/core';
import { AnalyzeModule } from '../analyze/analyze.module';
import { AnalyzeService } from '../analyze/analyze.service';
import { DependenciesFixModule } from '../dependencies-fix/dependencies-fix.module';
import { DependenciesFixService } from '../dependencies-fix/dependencies-fix.service';
import path from 'node:path';
import fs from 'node:fs';
import { printStartupBanner } from '../common/startup-banner';
import { version } from '../../package.json';

const supportedCommands = ['analyze', 'dependencies-fix'] as const;
type SupportedCommand = (typeof supportedCommands)[number];

interface CliOptions {
  command: string;
  targetPath: string;
  verbose: boolean;
  help: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const help = args.includes('--help') || args.includes('-h');
  const positionalArgs = args.filter(
    (arg) => !['--verbose', '-v', '--help', '-h'].includes(arg),
  );

  return {
    command: positionalArgs[0] ?? 'analyze',
    targetPath: path.resolve(positionalArgs[1] ?? process.cwd()),
    verbose,
    help,
  };
}

function isSupportedCommand(command: string): command is SupportedCommand {
  return supportedCommands.includes(command as SupportedCommand);
}

function printUsage(): void {
  console.log(`Accepted commands:
  batmanuel analyze [path] [--verbose]
  batmanuel dependencies-fix [path] [--verbose]

Options:
  --verbose, -v  Show internal execution logs
  --help, -h     Show this help message`);
}

function inferProjectId(targetPath: string, verbose: boolean): string {
  const pkgPath = path.join(targetPath, 'package.json');

  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      if (typeof pkg.name === 'string' && pkg.name.trim().length > 0) {
        return pkg.name;
      }
    } catch (err) {
      if (!verbose) return path.basename(targetPath);
      console.warn(`Could not read package.json at ${pkgPath}:`, err);
    }
  }

  return path.basename(targetPath);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!isSupportedCommand(options.command)) {
    console.error(`Unknown command: ${options.command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const projectId = inferProjectId(options.targetPath, options.verbose);

  printStartupBanner({
    appName: 'Batmanuel',
    version,
    environment: 'cli',
    port: 0,
    swaggerUrl: undefined,
  });

  const app = await NestFactory.createApplicationContext(
    options.command === 'dependencies-fix'
      ? DependenciesFixModule
      : AnalyzeModule,
    {
      logger: options.verbose
        ? ['log', 'error', 'warn', 'debug', 'verbose']
        : false,
    },
  );

  try {
    if (options.command === 'dependencies-fix') {
      const dependenciesFixService = app.get(DependenciesFixService);
      const result = await dependenciesFixService.fix(options.targetPath);
      console.log('Dependency remediation completed\n');
      console.log(`Fixed vulnerabilities: ${result.fixedVulnerabilities}`);
      console.log(`Updated dependencies: ${result.updatedDependencies}`);
      console.log(`Overrides added: ${result.overridesAdded}`);
      console.log(`Manual review required: ${result.manualReviewRequired}`);
      console.log(
        `Remaining vulnerabilities: ${result.remainingVulnerabilities}`,
      );
      if (result.changedFiles.length > 0) {
        console.log('Changed files:');
        result.changedFiles.forEach((file) => console.log(`- ${file}`));
      }
      return;
    }

    const analyzeService = app.get(AnalyzeService);

    const result = await analyzeService.analyze({
      sourcePath: options.targetPath,
      projectId,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error(err);
  } else {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Command failed: ${message}`);
  }
  process.exitCode = 1;
});
