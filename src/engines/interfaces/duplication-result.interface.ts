export interface DuplicationBlock {
  firstFile: string;
  firstFileStart: number;
  firstFileEnd: number;
  secondFile: string;
  secondFileStart: number;
  secondFileEnd: number;
  lines: number;
  tokens: number;
  fragment: string;
}

export interface DuplicationResult {
  totalFilesAnalyzed: number;
  duplicatedLines: number;
  totalLines: number;
  duplicationPercentage: number;
  duplicates: DuplicationBlock[];
  totalFiles: number;
}
