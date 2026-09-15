export interface DependenciesFixResult {
  fixedVulnerabilities: number;
  remainingVulnerabilities: number;
  updatedDependencies: number;
  overridesAdded: number;
  manualReviewRequired: number;
  changedFiles: string[];
}
