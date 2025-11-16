import { BrowserAutomationError } from '../oracle/errors.js';

export interface DiffExtractionResult {
  rawBlocks: string[];
  selectedBlock?: string;
  score?: number;
  reason?: string;
}

const FENCE_RE = /```[^\n]*\n([\s\S]*?)```/g;
const HUNK_RE = /@@ -\d+,\d+ \+\d+,\d+ @@/;
const DIFF_HEADER_RE = /^diff --git /m;

export function extractUnifiedDiff(markdown: string): DiffExtractionResult {
  if (!markdown) {
    return { rawBlocks: [], reason: 'empty' };
  }
  const fencedMatches = [...markdown.matchAll(FENCE_RE)];
  const fenced = fencedMatches.map((match) => match[1].trim());
  if (!fenced.length) {
    const hasPartialFence = markdown.includes('```diff') || markdown.includes('```patch');
    return { rawBlocks: [], reason: hasPartialFence ? 'partial_fence' : 'no_fenced_blocks' };
  }
  const scored = fenced
    .map((block) => {
      let score = 0;
      if (DIFF_HEADER_RE.test(block)) score += 5;
      if (HUNK_RE.test(block)) score += 3;
      if (block.startsWith('diff --git')) score += 2;
      if (block.length > 200) score += 1;
      return { block, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { rawBlocks: [], reason: 'no_scored_blocks' };
  }
  const best = scored[0];
  return {
    rawBlocks: scored.map((entry) => entry.block),
    selectedBlock: best.block,
    score: best.score,
  };
}

export function isValidUnifiedDiff(diff: string | undefined, strict = false): boolean {
  if (!diff) return false;
  if (!DIFF_HEADER_RE.test(diff)) return false;
  if (!HUNK_RE.test(diff)) return false;
  if (strict) {
    const lines = diff.split('\n');
    let sawFileHeader = false;
    let sawUnsafePath = false;
    const fileHeaderRe = /^diff --git a\/(.+?) b\/(.+)$/;
    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        const match = fileHeaderRe.exec(line);
        if (!match) {
          return false;
        }
        const [, aPath, bPath] = match;
        const paths = [aPath, bPath];
        for (const p of paths) {
          const normalized = p.replace(/\\/g, '/');
          if (
            normalized.startsWith('/') ||
            normalized.startsWith('../') ||
            normalized.includes('/../') ||
            /^[a-zA-Z]:\//.test(normalized)
          ) {
            sawUnsafePath = true;
            break;
          }
        }
      }
      if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        sawFileHeader = true;
      }
      if (line.startsWith('@@')) {
        if (!/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/.test(line)) {
          return false;
        }
      }
    }
    if (!sawFileHeader || sawUnsafePath) {
      return false;
    }
  }
  return true;
}

export function ensureValidDiff(diff: string | undefined, strict = false): string {
  if (!isValidUnifiedDiff(diff, strict)) {
    throw new BrowserAutomationError('Assistant did not return a valid unified diff.', {
      stage: 'diff-extraction',
    });
  }
  return diff as string;
}
