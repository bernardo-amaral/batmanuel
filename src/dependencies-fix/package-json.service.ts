import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

@Injectable()
export class PackageJsonService {
  read(projectPath: string): {
    path: string;
    content: string;
    value: PackageJson;
  } {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!existsSync(packageJsonPath)) {
      throw new Error(`package.json not found at: ${packageJsonPath}`);
    }

    const content = readFileSync(packageJsonPath, 'utf8');
    try {
      const value: unknown = JSON.parse(content);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('package.json must contain a JSON object');
      }
      return { path: packageJsonPath, content, value: value as PackageJson };
    } catch (error) {
      throw new Error(
        `Invalid package.json: ${error instanceof Error ? error.message : 'invalid JSON'}`,
      );
    }
  }

  write(packageJsonPath: string, value: PackageJson): void {
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(value, null, 2)}\n`,
      'utf8',
    );
  }

  updateDependency(value: PackageJson, name: string, version: string): boolean {
    for (const section of ['dependencies', 'devDependencies'] as const) {
      if (value[section]?.[name]) {
        value[section][name] = version;
        return true;
      }
    }
    return false;
  }

  addOverride(value: PackageJson, name: string, version: string): boolean {
    const overrides = value.overrides ?? {};
    const current = overrides[name];
    if (current === version) return false;

    value.overrides = { ...overrides, [name]: version };
    return true;
  }
}
