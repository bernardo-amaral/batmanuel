export interface PackageDependency {
  name: string;
  version: string;
  dev: boolean;
  isDirectDependency: boolean;
  dependencyPath?: string[];
}

export interface DependencyVulnerability {
  id: string;
  summary: string;
  severity?: string;
  fixedVersion?: string;
}

export interface VulnerableDependency {
  name: string;
  version: string;
  isDirectDependency: boolean;
  dependencyPath?: string[];
  vulnerabilities: DependencyVulnerability[];
}

export interface DependencyScanResult {
  vulnerableDependencies: VulnerableDependency[];
}
