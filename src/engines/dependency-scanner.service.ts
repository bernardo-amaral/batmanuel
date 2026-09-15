/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  PackageDependency,
  VulnerableDependency,
} from './interfaces/dependency-result.interface';
import { Issue } from 'src/analyze/interfaces/issue.interface';

const OSV_API = 'https://api.osv.dev/v1/querybatch';

export interface DependencyVulnerabilityFinding {
  id: string;
  packageName: string;
  installedVersion: string;
  fixedVersion?: string;
  dependencyPath?: string[];
  isDirectDependency: boolean;
  severity: Issue['severity'];
  summary?: string;
}

@Injectable()
export class DependencyScannerService {
  private readonly logger = new Logger(DependencyScannerService.name);

  /**
   *
   * @param projectRoot
   * @returns
   */
  async scanPackageJson(projectRoot: string): Promise<Issue[]> {
    const findings = await this.analyzeDependencies(projectRoot);
    return findings.map((finding) => ({
      engine: 'osv-scanner',
      type: 'dependency',
      severity: finding.severity,
      ruleId: `osv-${finding.id}`,
      message: `Dependency ${finding.packageName}@${finding.installedVersion} is affected by ${finding.id}${
        finding.summary ? `: ${finding.summary}` : ''
      }`,
      file: 'package.json',
      line: this.getDependencyLineNumber(
        projectRoot,
        finding.packageName,
        finding.installedVersion,
      ),
    }));
  }

  /** Returns remediation metadata while keeping scanPackageJson read-only. */
  async analyzeDependencies(
    projectRoot: string,
    failOnQueryError = false,
  ): Promise<DependencyVulnerabilityFinding[]> {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      this.logger.warn(`package.json not found at: ${packageJsonPath}`);
      return [];
    }

    const pkg: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = this.resolveDependencies(projectRoot, pkg);
    if (deps.length === 0) return [];

    const vulnerableDependencies = await this.queryOsvBatch(
      deps,
      failOnQueryError,
    );
    return vulnerableDependencies.flatMap((dependency) =>
      dependency.vulnerabilities.map((vulnerability) => ({
        id: vulnerability.id,
        packageName: dependency.name,
        installedVersion: dependency.version,
        fixedVersion: vulnerability.fixedVersion,
        dependencyPath: dependency.dependencyPath,
        isDirectDependency: dependency.isDirectDependency,
        severity: this.mapSeverity(vulnerability.severity),
        summary: vulnerability.summary,
      })),
    );
  }

  /**
   *
   * @param pkg
   * @returns
   */
  private resolveDependencies(
    projectRoot: string,
    pkg: unknown,
  ): PackageDependency[] {
    const lockPath = path.join(projectRoot, 'package-lock.json');
    const lock: { packages?: Record<string, unknown> } | undefined =
      fs.existsSync(lockPath)
        ? (JSON.parse(fs.readFileSync(lockPath, 'utf8')) as {
            packages?: Record<string, unknown>;
          })
        : undefined;
    const directNames = new Set<string>([
      ...objectKeys(pkg, 'dependencies'),
      ...objectKeys(pkg, 'devDependencies'),
    ]);

    if (lock?.packages && typeof lock.packages === 'object') {
      return Object.entries(lock.packages)
        .filter(([location, value]) => location && isLockPackage(value))
        .map(([location, value]) => {
          const packageValue = value as { version: string; dev?: boolean };
          const name = packageNameFromLockLocation(location);
          return {
            name,
            version: packageValue.version,
            dev: Boolean(packageValue.dev),
            isDirectDependency:
              directNames.has(name) && location === `node_modules/${name}`,
            dependencyPath: location.split('/node_modules/').filter(Boolean),
          };
        });
    }

    return this.extractDependencies(pkg);
  }

  private extractDependencies(pkg: unknown): PackageDependency[] {
    const result: PackageDependency[] = [];

    const addDeps = (section: string, dev: boolean) => {
      const deps = objectAt(pkg, section);
      for (const [name, spec] of Object.entries(deps)) {
        result.push({
          name,
          version: String(spec).replace(/^[~^<>= ]+/, ''),
          dev,
          isDirectDependency: true,
        });
      }
    };

    addDeps('dependencies', false);
    addDeps('devDependencies', true);

    return result;
  }

  /**
   *
   * @param deps
   * @returns
   */
  private async queryOsvBatch(
    deps: PackageDependency[],
    failOnQueryError: boolean,
  ): Promise<VulnerableDependency[]> {
    const queries = deps.map((dep) => ({
      package: {
        name: dep.name,
        ecosystem: 'npm',
      },
      version: dep.version,
    }));

    try {
      const response = await fetch(OSV_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queries }),
      });

      if (!response.ok) {
        const error = new Error(
          `OSV querybatch failed with status ${response.status}`,
        );
        if (failOnQueryError) throw error;
        this.logger.warn(error.message);
        return [];
      }

      const data: any = await response.json();

      const vulnerable: VulnerableDependency[] = [];

      (data?.results || []).forEach((result: any, index: number) => {
        const vulns = result.vulns || result.vulnerabilities || [];
        if (!Array.isArray(vulns) || vulns.length === 0) {
          return;
        }

        const dep = deps[index];

        vulnerable.push({
          name: dep.name,
          version: dep.version,
          isDirectDependency: dep.isDirectDependency,
          dependencyPath: dep.dependencyPath,
          vulnerabilities: vulns.map((v: any) => ({
            id: v.id,
            summary: v.summary,
            severity: v.severity,
            fixedVersion: firstFixedVersion(v),
          })),
        });
      });

      return vulnerable;
    } catch (error) {
      this.logger.error('Error querying OSV API', error as Error);
      if (failOnQueryError) throw error;
      return [];
    }
  }

  /**
   *
   * @param severity
   * @returns
   */
  private mapSeverity(severity?: string): Issue['severity'] {
    if (!severity) {
      return 'medium';
    }

    const s = severity.toLowerCase();
    if (s.includes('critical')) return 'critical';
    if (s.includes('high')) return 'high';
    if (s.includes('medium')) return 'medium';
    if (s.includes('low')) return 'low';

    return 'medium';
  }

  /**
   *
   * @param projectRoot
   * @param depName
   * @param depVersion
   * @returns
   */
  private getDependencyLineNumber(
    projectRoot: string,
    depName: string,
    depVersion: string,
  ): number {
    try {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const content = fs.readFileSync(packageJsonPath, 'utf-8');

      const lines = content.split(/\r?\n/);

      const needle = `"${depName}": "${depVersion}"`;

      const index = lines.findIndex((line) => line.includes(needle));

      if (index === -1) {
        const fallbackIndex = lines.findIndex((line) =>
          line.includes(`"${depName}":`),
        );
        return fallbackIndex === -1 ? 0 : fallbackIndex + 1;
      }

      return index + 1;
    } catch {
      return 0;
    }
  }
}

function isLockPackage(
  value: unknown,
): value is { version: string; dev?: boolean } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { version?: unknown }).version === 'string'
  );
}

function packageNameFromLockLocation(location: string): string {
  const parts = location.split('/');
  const nodeModulesIndex = parts.lastIndexOf('node_modules');
  const packageParts = parts.slice(nodeModulesIndex + 1);
  return packageParts[0]?.startsWith('@')
    ? packageParts.slice(0, 2).join('/')
    : (packageParts[0] ?? location);
}

function firstFixedVersion(vulnerability: unknown): string | undefined {
  const fixedVersions = arrayAt(vulnerability, 'affected').flatMap((affected) =>
    arrayAt(affected, 'ranges').flatMap((range) =>
      arrayAt(range, 'events')
        .map((event) => propertyAt(event, 'fixed'))
        .filter(
          (version: unknown): version is string => typeof version === 'string',
        ),
    ),
  );
  return fixedVersions.sort(compareVersions)[0];
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const candidate = (value as Record<string, unknown>)[key];
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
}

function objectKeys(value: unknown, key: string): string[] {
  return Object.keys(objectAt(value, key));
}

function propertyAt(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function arrayAt(value: unknown, key: string): unknown[] {
  const candidate = propertyAt(value, key);
  return Array.isArray(candidate) ? candidate : [];
}

function compareVersions(left: string, right: string): number {
  const leftParts = left
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index++
  ) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
