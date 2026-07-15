export type IssueType = 'security' | 'quality' | 'dependency';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Issue {
  engine: string;
  type: IssueType;
  severity: IssueSeverity;
  ruleId: string;
  message: string;
  file: string;
  line: number;
}
