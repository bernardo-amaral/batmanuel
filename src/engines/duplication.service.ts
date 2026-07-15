/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import {
  DuplicationBlock,
  DuplicationResult,
} from './interfaces/duplication-result.interface';

interface NormalizedFile {
  filePath: string;
  lines: string[];
}

interface BlockOccurrence {
  filePath: string;
  startLine: number;
}

const MIN_BLOCK_SIZE = 10;
const DEFAULT_EXTENSIONS = ['.ts', '.js'];
const DEFAULT_IGNORE_PATTERNS = ['node_modules', 'dist', '.git', 'coverage'];

@Injectable()
export class DuplicationService {
  private readonly logger = new Logger(DuplicationService.name);

  async analyzeDirectory(
    rootDir: string,
    extensions: string[] = DEFAULT_EXTENSIONS,
    ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS,
  ): Promise<DuplicationResult> {
    const filePaths = this.collectFiles(rootDir, extensions, ignorePatterns);
    const files = filePaths.map((filePath) => this.readAndNormalize(filePath));

    return await this.detectDuplicates(files);
  }

  detectDuplicates(files: NormalizedFile[]): DuplicationResult {
    const blockIndex = new Map<string, BlockOccurrence[]>();
    const duplicates: DuplicationBlock[] = [];
    const seenPairs = new Set<string>();

    let totalLines = 0;

    for (const file of files) {
      totalLines += file.lines.filter((line) =>
        this.isMeaningfulLine(line),
      ).length;

      for (let i = 0; i <= file.lines.length - MIN_BLOCK_SIZE; i++) {
        const rawBlock = file.lines.slice(i, i + MIN_BLOCK_SIZE);
        const meaningfulLines = rawBlock.filter((line) =>
          this.isMeaningfulLine(line),
        );

        if (meaningfulLines.length < MIN_BLOCK_SIZE) {
          continue;
        }

        const normalizedBlock = meaningfulLines.join('\n').trim();

        if (!normalizedBlock) {
          continue;
        }

        const hash = this.hashBlock(normalizedBlock);
        const occurrences = blockIndex.get(hash) ?? [];

        for (const occurrence of occurrences) {
          if (occurrence.filePath === file.filePath) {
            continue;
          }

          const pairKey = this.buildPairKey(
            occurrence.filePath,
            occurrence.startLine,
            file.filePath,
            i,
          );

          if (seenPairs.has(pairKey)) {
            continue;
          }

          seenPairs.add(pairKey);

          duplicates.push({
            firstFile: occurrence.filePath,
            firstFileStart: occurrence.startLine + 1,
            firstFileEnd: occurrence.startLine + MIN_BLOCK_SIZE,
            secondFile: file.filePath,
            secondFileStart: i + 1,
            secondFileEnd: i + MIN_BLOCK_SIZE,
            lines: meaningfulLines.length,
            tokens: normalizedBlock.split(/\s+/).length,
            fragment: normalizedBlock,
          });
        }

        occurrences.push({ filePath: file.filePath, startLine: i });
        blockIndex.set(hash, occurrences);
      }
    }

    const consolidatedDuplicates = this.consolidateDuplicates(duplicates);
    const duplicatedLines = consolidatedDuplicates.reduce(
      (sum, duplicate) => sum + duplicate.lines,
      0,
    );

    const duplicationPercentage =
      totalLines > 0
        ? Math.round((duplicatedLines / totalLines) * 10000) / 100
        : 0;

    return {
      totalFilesAnalyzed: files.length,
      duplicatedLines,
      totalLines,
      duplicationPercentage,
      duplicates: consolidatedDuplicates,
    };
  }

  private readAndNormalize(filePath: string): NormalizedFile {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map((line) => this.normalizeLine(line));

    return { filePath, lines };
  }

  private normalizeLine(line: string): string {
    const normalized = line
      .trim()
      .replace(/\/\/.*$/, '')
      .replace(/\s+/g, ' ');

    if (
      normalized === '' ||
      normalized === '{' ||
      normalized === '}' ||
      normalized === '};' ||
      normalized.startsWith('import ') ||
      normalized.startsWith('export interface ') ||
      normalized.startsWith('export type ') ||
      normalized.startsWith('@')
    ) {
      return '';
    }

    return normalized;
  }

  private isMeaningfulLine(line: string): boolean {
    return line.trim().length > 0;
  }

  private hashBlock(block: string): string {
    let hash = 0;

    for (let i = 0; i < block.length; i++) {
      hash = (hash << 5) - hash + block.charCodeAt(i);
      hash |= 0;
    }

    return hash.toString();
  }

  private buildPairKey(
    fileA: string,
    startA: number,
    fileB: string,
    startB: number,
  ): string {
    const left = `${fileA}:${startA}`;
    const right = `${fileB}:${startB}`;

    return [left, right].sort().join('|');
  }

  private consolidateDuplicates(
    duplicates: DuplicationBlock[],
  ): DuplicationBlock[] {
    const grouped = new Map<string, DuplicationBlock>();

    for (const duplicate of duplicates) {
      const key = [
        duplicate.firstFile,
        duplicate.secondFile,
        duplicate.fragment,
      ].join('|');

      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, duplicate);
        continue;
      }

      existing.firstFileStart = Math.min(
        existing.firstFileStart,
        duplicate.firstFileStart,
      );
      existing.firstFileEnd = Math.max(
        existing.firstFileEnd,
        duplicate.firstFileEnd,
      );
      existing.secondFileStart = Math.min(
        existing.secondFileStart,
        duplicate.secondFileStart,
      );
      existing.secondFileEnd = Math.max(
        existing.secondFileEnd,
        duplicate.secondFileEnd,
      );
      existing.lines = Math.max(existing.lines, duplicate.lines);
      existing.tokens = Math.max(existing.tokens, duplicate.tokens);
    }

    return Array.from(grouped.values());
  }

  private collectFiles(
    dir: string,
    extensions: string[],
    ignorePatterns: string[],
  ): string[] {
    const results: string[] = [];

    if (!fs.existsSync(dir)) {
      this.logger.warn(`Directory not found: ${dir}`);
      return results;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (ignorePatterns.some((pattern) => fullPath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(
          ...this.collectFiles(fullPath, extensions, ignorePatterns),
        );
      } else if (extensions.includes(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
