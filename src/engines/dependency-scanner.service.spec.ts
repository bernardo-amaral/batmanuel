import { PackageDependency } from './interfaces/dependency-result.interface';
import { parseNpmAuditResult } from './dependency-scanner.service';

describe('parseNpmAuditResult', () => {
  const dependencies: PackageDependency[] = [
    {
      name: 'direct-package',
      version: '1.0.0',
      dev: false,
      isDirectDependency: true,
    },
    {
      name: 'parent-package',
      version: '3.0.0',
      dev: false,
      isDirectDependency: true,
    },
    {
      name: 'transitive-package',
      version: '2.0.0',
      dev: false,
      isDirectDependency: false,
      dependencyPath: ['parent-package', 'transitive-package'],
    },
  ];

  it('maps npm audit advisories and a compatible direct fix', () => {
    const findings = parseNpmAuditResult(
      {
        vulnerabilities: {
          'direct-package': {
            severity: 'high',
            isDirect: true,
            nodes: ['node_modules/direct-package'],
            via: [
              { source: 123, title: 'Known vulnerability', severity: 'high' },
            ],
            fixAvailable: {
              name: 'direct-package',
              version: '1.0.1',
              isSemVerMajor: false,
            },
          },
        },
      },
      dependencies,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        id: '123',
        packageName: 'direct-package',
        installedVersion: '1.0.0',
        fixedVersion: '1.0.1',
        isDirectDependency: true,
        severity: 'high',
      }),
    ]);
  });

  it('maps a safe parent-package fix for a transitive vulnerability', () => {
    const findings = parseNpmAuditResult(
      {
        vulnerabilities: {
          'transitive-package': {
            severity: 'moderate',
            isDirect: false,
            nodes: [
              'node_modules/parent-package/node_modules/transitive-package',
            ],
            via: [{ source: 456, title: 'Nested vulnerability' }],
            fixAvailable: {
              name: 'parent-package',
              version: '3.1.0',
              isSemVerMajor: false,
            },
          },
        },
      },
      dependencies,
    );

    expect(findings[0]).toEqual(
      expect.objectContaining({
        packageName: 'transitive-package',
        fixedVersion: '3.1.0',
        remediationPackageName: 'parent-package',
        remediationInstalledVersion: '3.0.0',
        remediationIsDirectDependency: true,
        isDirectDependency: false,
        severity: 'medium',
      }),
    );
  });
});
