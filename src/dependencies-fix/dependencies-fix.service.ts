import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  DependencyScannerService,
  DependencyVulnerabilityFinding,
} from '../engines/dependency-scanner.service';
import { DependenciesFixResult } from './interfaces/dependencies-fix-result.interface';
import { PackageJson, PackageJsonService } from './package-json.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class DependenciesFixService {
  constructor(
    private readonly dependencyScanner: DependencyScannerService,
    private readonly packageJsonService: PackageJsonService,
  ) {}

  async fix(projectPath: string): Promise<DependenciesFixResult> {
    const manifest = this.packageJsonService.read(projectPath);
    const lockPath = `${projectPath}/package-lock.json`;
    if (!existsSync(lockPath)) {
      throw new Error(
        'package-lock.json is required for a safe dependency remediation',
      );
    }

    const originalLock = readFileSync(lockPath, 'utf8');
    const findings = await this.dependencyScanner.analyzeDependencies(
      projectPath,
      true,
    );
    const plan = this.plan(manifest.value, findings);
    const changedFiles: string[] = [];

    if (plan.updatedDependencies === 0 && plan.overridesAdded === 0) {
      return this.result(0, findings.length, plan, changedFiles);
    }

    try {
      this.packageJsonService.write(manifest.path, manifest.value);
      changedFiles.push('package.json');
      await execFileAsync(
        'npm',
        ['install', '--package-lock-only', '--ignore-scripts'],
        {
          cwd: projectPath,
        },
      );
      changedFiles.push('package-lock.json');

      const remaining = await this.dependencyScanner.analyzeDependencies(
        projectPath,
        true,
      );
      const fixed = Math.max(0, findings.length - remaining.length);
      if (fixed === 0) {
        throw new Error('Planned remediation could not be validated');
      }
      return this.result(fixed, remaining.length, plan, changedFiles);
    } catch (error) {
      writeFileSync(manifest.path, manifest.content, 'utf8');
      writeFileSync(lockPath, originalLock, 'utf8');
      throw error;
    }
  }

  private plan(pkg: PackageJson, findings: DependencyVulnerabilityFinding[]) {
    let updatedDependencies = 0;
    let overridesAdded = 0;
    let manualReviewRequired = 0;
    const handled = new Set<string>();

    for (const finding of findings) {
      if (!finding.fixedVersion) continue;
      const key = `${finding.packageName}@${finding.fixedVersion}`;
      if (handled.has(key)) continue;
      handled.add(key);

      if (!isCompatibleUpdate(finding.installedVersion, finding.fixedVersion)) {
        manualReviewRequired++;
        continue;
      }

      if (finding.isDirectDependency) {
        if (
          this.packageJsonService.updateDependency(
            pkg,
            finding.packageName,
            finding.fixedVersion,
          )
        ) {
          updatedDependencies++;
        }
      } else if (
        this.packageJsonService.addOverride(
          pkg,
          finding.packageName,
          finding.fixedVersion,
        )
      ) {
        overridesAdded++;
      }
    }
    return { updatedDependencies, overridesAdded, manualReviewRequired };
  }

  private result(
    fixedVulnerabilities: number,
    remainingVulnerabilities: number,
    plan: {
      updatedDependencies: number;
      overridesAdded: number;
      manualReviewRequired: number;
    },
    changedFiles: string[],
  ): DependenciesFixResult {
    return {
      fixedVulnerabilities,
      remainingVulnerabilities,
      ...plan,
      changedFiles,
    };
  }
}

function isCompatibleUpdate(current: string, fixed: string): boolean {
  const currentMajor = Number.parseInt(current.split('.')[0] ?? '', 10);
  const fixedMajor = Number.parseInt(fixed.split('.')[0] ?? '', 10);
  return (
    Number.isFinite(currentMajor) &&
    Number.isFinite(fixedMajor) &&
    currentMajor === fixedMajor
  );
}
