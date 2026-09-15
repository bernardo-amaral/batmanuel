import { DependencyScannerService } from '../engines/dependency-scanner.service';
import { DependenciesFixService } from './dependencies-fix.service';
import { PackageJson, PackageJsonService } from './package-json.service';

describe('DependenciesFixService remediation planning', () => {
  const service = new DependenciesFixService(
    {} as DependencyScannerService,
    new PackageJsonService(),
  );

  it('updates a direct parent package recommended by npm audit', () => {
    const manifest: PackageJson = {
      dependencies: { 'parent-package': '3.0.0' },
    };

    const plan = service['plan'](manifest, [
      {
        id: 'npm-123',
        packageName: 'transitive-package',
        installedVersion: '2.0.0',
        fixedVersion: '3.1.0',
        remediationPackageName: 'parent-package',
        remediationInstalledVersion: '3.0.0',
        remediationIsDirectDependency: true,
        isDirectDependency: false,
        severity: 'high',
      },
    ]);

    expect(plan).toEqual({
      updatedDependencies: 1,
      overridesAdded: 0,
      manualReviewRequired: 0,
    });
    expect(manifest.dependencies?.['parent-package']).toBe('3.1.0');
  });

  it('adds a major transitive override when npm audit provides a safe version', () => {
    const manifest: PackageJson = {};

    const plan = service['plan'](manifest, [
      {
        id: 'npm-123',
        packageName: 'transitive-package',
        installedVersion: '2.0.0',
        fixedVersion: '4.0.0',
        remediationPackageName: 'transitive-package',
        remediationInstalledVersion: '2.0.0',
        remediationIsDirectDependency: false,
        requiresMajorUpdate: true,
        isDirectDependency: false,
        severity: 'high',
      },
    ]);

    expect(plan).toEqual({
      updatedDependencies: 0,
      overridesAdded: 1,
      manualReviewRequired: 0,
    });
    expect(manifest.overrides?.['transitive-package']).toBe('4.0.0');
  });
});
