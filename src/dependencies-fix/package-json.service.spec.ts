import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PackageJsonService } from './package-json.service';

describe('PackageJsonService', () => {
  let projectPath: string;
  const service = new PackageJsonService();

  beforeEach(() => {
    projectPath = mkdtempSync(path.join(tmpdir(), 'batmanuel-package-json-'));
    writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({
        dependencies: { direct: '^1.0.0' },
        devDependencies: { dev: '^1.0.0' },
        overrides: { preserved: '2.0.0' },
      }),
    );
  });

  afterEach(() => rmSync(projectPath, { recursive: true, force: true }));

  it('updates dependencies and preserves existing overrides', () => {
    const manifest = service.read(projectPath);

    expect(service.updateDependency(manifest.value, 'direct', '1.0.1')).toBe(
      true,
    );
    expect(service.updateDependency(manifest.value, 'dev', '1.0.1')).toBe(true);
    expect(service.addOverride(manifest.value, 'transitive', '3.0.1')).toBe(
      true,
    );

    expect(manifest.value).toEqual({
      dependencies: { direct: '1.0.1' },
      devDependencies: { dev: '1.0.1' },
      overrides: { preserved: '2.0.0', transitive: '3.0.1' },
    });
  });

  it('preserves an existing override when it is already newer', () => {
    const manifest = service.read(projectPath);
    expect(service.addOverride(manifest.value, 'preserved', '1.9.9')).toBe(
      false,
    );
    expect(manifest.value.overrides?.preserved).toBe('2.0.0');
  });

  it('upgrades an existing override when the remediation is newer', () => {
    const manifest = service.read(projectPath);
    expect(service.addOverride(manifest.value, 'preserved', '2.0.1')).toBe(
      true,
    );
    expect(manifest.value.overrides?.preserved).toBe('2.0.1');
  });
});
