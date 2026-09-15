/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'node:util';
import {
  PackageDependency,
  VulnerableDependency,
} from './interfaces/dependency-result.interface';
import { Issue } from 'src/analyze/interfaces/issue.interface';

const OSV_API = 'https://api.osv.dev/v1/querybatch';
const execFileAsync = promisify(execFile);

export interface DependencyVulnerabilityFinding {
  id: string;
  packageName: string;
  installedVersion: string;
  fixedVersion?: string;
  remediationPackageName?: string;
  remediationInstalledVersion?: string;
  remediationIsDirectDependency?: boolean;
  requiresMajorUpdate?: boolean;
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

    let vulnerableDependencies: VulnerableDependency[];
    try {
      vulnerableDependencies = await this.queryOsvBatch(deps);
    } catch (error) {
      this.logger.warn(
        `OSV is unavailable; using npm audit fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return this.analyzeNpmAudit(projectRoot, deps, failOnQueryError);
    }

    const osvFindings = vulnerableDependencies.flatMap((dependency) =>
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
    if (osvFindings.length > 0) {
      const npmFindings = await this.analyzeNpmAudit(projectRoot, deps, false);
      return mergeVulnerabilityFindings(osvFindings, npmFindings);
    }

    this.logger.log('OSV returned no findings; using npm audit fallback');
    return this.analyzeNpmAudit(projectRoot, deps, failOnQueryError);
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
  ): Promise<VulnerableDependency[]> {
    const queries = deps.map((dep) => ({
      package: {
        name: dep.name,
        ecosystem: 'npm',
      },
      version: dep.version,
    }));

    const response = await fetch(OSV_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ queries }),
    });

    if (!response.ok) {
      throw new Error(`OSV querybatch failed with status ${response.status}`);
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
  }

  private async analyzeNpmAudit(
    projectRoot: string,
    dependencies: PackageDependency[],
    failOnQueryError: boolean,
  ): Promise<DependencyVulnerabilityFinding[]> {
    try {
      const report = await runNpmAudit(projectRoot);
      return parseNpmAuditResult(report, dependencies);
    } catch (error) {
      this.logger.error('npm audit fallback failed', error as Error);
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
  return asObject(propertyAt(value, key));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
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

function stringAt(value: unknown, key: string): string | undefined {
  const candidate = propertyAt(value, key);
  return typeof candidate === 'string' ? candidate : undefined;
}

async function runNpmAudit(projectRoot: string): Promise<unknown> {
  let output: string;
  try {
    const result = await execFileAsync(
      'npm',
      ['audit', '--json', '--package-lock-only'],
      { cwd: projectRoot },
    );
    output = result.stdout;
  } catch (error) {
    const auditOutput = stringAt(error, 'stdout');
    if (!auditOutput) throw error;
    output = auditOutput;
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error('npm audit did not return valid JSON');
  }
}

export function parseNpmAuditResult(
  report: unknown,
  dependencies: PackageDependency[],
): DependencyVulnerabilityFinding[] {
  return Object.entries(objectAt(report, 'vulnerabilities')).flatMap(
    ([packageName, vulnerability]) => {
      const audit = asObject(vulnerability);
      const matchingDependencies = dependencies.filter(
        (dependency) => dependency.name === packageName,
      );
      const isDirectDependency = propertyAt(audit, 'isDirect') === true;
      const dependency =
        matchingDependencies.find(
          (candidate) => candidate.isDirectDependency === isDirectDependency,
        ) ?? matchingDependencies[0];

      if (!dependency) return [];

      const advisories = arrayAt(audit, 'via').filter(
        (via): via is Record<string, unknown> =>
          Boolean(via) && typeof via === 'object' && !Array.isArray(via),
      );
      const fix = objectAt(audit, 'fixAvailable');
      const fixName = stringAt(fix, 'name');
      const remediationDependency = fixName
        ? (dependencies.find(
            (candidate) =>
              candidate.name === fixName && candidate.isDirectDependency,
          ) ?? dependencies.find((candidate) => candidate.name === fixName))
        : dependency;
      const fixedVersion = remediationDependency
        ? (stringAt(fix, 'version') ??
          fixedVersionFromAdvisoryRanges(advisories))
        : undefined;
      const dependencyPath = arrayAt(audit, 'nodes')
        .filter((node): node is string => typeof node === 'string')
        .map((node) => node.split('/node_modules/').filter(Boolean)[0] ?? node);

      const toFinding = (advisory: Record<string, unknown>) => ({
        id: advisoryIdentifier(advisory, packageName),
        packageName,
        installedVersion: dependency.version,
        fixedVersion,
        remediationPackageName: remediationDependency?.name,
        remediationInstalledVersion: remediationDependency?.version,
        remediationIsDirectDependency:
          remediationDependency?.isDirectDependency,
        requiresMajorUpdate:
          propertyAt(fix, 'isSemVerMajor') === true ||
          requiresMajorVersionChange(
            remediationDependency?.version,
            fixedVersion,
          ),
        dependencyPath,
        isDirectDependency,
        severity: severityFromNpm(
          stringAt(advisory, 'severity') ?? stringAt(audit, 'severity'),
        ),
        summary: stringAt(advisory, 'title'),
      });

      return advisories.length > 0
        ? advisories.map(toFinding)
        : [toFinding({})];
    },
  );
}

function mergeVulnerabilityFindings(
  osvFindings: DependencyVulnerabilityFinding[],
  npmFindings: DependencyVulnerabilityFinding[],
): DependencyVulnerabilityFinding[] {
  const npmFindingsByPackage = new Map<
    string,
    DependencyVulnerabilityFinding
  >();
  for (const finding of npmFindings) {
    if (finding.fixedVersion) {
      npmFindingsByPackage.set(
        `${finding.packageName}@${finding.installedVersion}`,
        finding,
      );
    }
  }

  const osvPackages = new Set(
    osvFindings.map(
      (finding) => `${finding.packageName}@${finding.installedVersion}`,
    ),
  );
  const enrichedOsvFindings = osvFindings.map((finding) => {
    const npmFinding = npmFindingsByPackage.get(
      `${finding.packageName}@${finding.installedVersion}`,
    );
    return npmFinding
      ? {
          ...finding,
          fixedVersion: finding.fixedVersion ?? npmFinding.fixedVersion,
          remediationPackageName: npmFinding.remediationPackageName,
          remediationInstalledVersion: npmFinding.remediationInstalledVersion,
          remediationIsDirectDependency:
            npmFinding.remediationIsDirectDependency,
          requiresMajorUpdate: npmFinding.requiresMajorUpdate,
        }
      : finding;
  });

  return [
    ...enrichedOsvFindings,
    ...npmFindings.filter(
      (finding) =>
        !osvPackages.has(`${finding.packageName}@${finding.installedVersion}`),
    ),
  ];
}

function severityFromNpm(severity: string | undefined): Issue['severity'] {
  if (severity === 'critical' || severity === 'high' || severity === 'low') {
    return severity;
  }
  return 'medium';
}

function advisoryIdentifier(
  advisory: Record<string, unknown>,
  packageName: string,
): string {
  const source = propertyAt(advisory, 'source');
  return typeof source === 'string' || typeof source === 'number'
    ? String(source)
    : `npm-${packageName}`;
}

function fixedVersionFromAdvisoryRanges(
  advisories: Record<string, unknown>[],
): string | undefined {
  const candidates = advisories
    .map((advisory) => safeVersionFromRange(stringAt(advisory, 'range')))
    .filter((version): version is string => Boolean(version));

  return candidates.sort(compareVersions).at(-1);
}

function safeVersionFromRange(range: string | undefined): string | undefined {
  if (!range) return undefined;

  const upperBounds = [...range.matchAll(/(<|<=)\s*v?(\d+\.\d+\.\d+)/g)];
  const upperBound = upperBounds.at(-1);
  if (!upperBound) return undefined;

  const [, operator, version] = upperBound;
  if (operator === '<') return version;

  const [major, minor, patch] = version.split('.').map(Number);
  if (![major, minor, patch].every(Number.isFinite)) return undefined;
  return `${major}.${minor}.${patch + 1}`;
}

function requiresMajorVersionChange(
  installedVersion: string | undefined,
  fixedVersion: string | undefined,
): boolean {
  if (!installedVersion || !fixedVersion) return false;
  const installedMajor = Number.parseInt(
    installedVersion.split('.')[0] ?? '',
    10,
  );
  const fixedMajor = Number.parseInt(fixedVersion.split('.')[0] ?? '', 10);
  return (
    Number.isFinite(installedMajor) &&
    Number.isFinite(fixedMajor) &&
    installedMajor !== fixedMajor
  );
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
