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
const BEGIN_PATCH_RE = /^\*\*\*\s*Begin Patch[\r\n]+([\s\S]*?)^\*\*\*\s*End Patch\s*$/im;
const UPDATE_FILE_RE = /^\*\*\*\s*Update File:\s*(.+)$/im;

function stripCarriageReturns(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

export function extractUnifiedDiff(markdown: string): DiffExtractionResult {
  if (!markdown) {
    return { rawBlocks: [], reason: 'empty' };
  }
  const fencedMatches = [...markdown.matchAll(FENCE_RE)];
  const fenced = fencedMatches.map((match) => stripCarriageReturns(match[1].trim()));
  if (!fenced.length) {
    const hasPartialFence = markdown.includes('```diff') || markdown.includes('```patch');
    const normalizedFromBeginPatch = normalizeBeginPatch(markdown);
    if (normalizedFromBeginPatch) {
      return {
        rawBlocks: [normalizedFromBeginPatch],
        selectedBlock: normalizedFromBeginPatch,
        score: 5,
        reason: 'normalized_begin_patch',
      };
    }
    return { rawBlocks: [], reason: hasPartialFence ? 'partial_fence' : 'no_fenced_blocks' };
  }
  const scored = fenced
    .map((block) => {
      let score = 0;
      if (DIFF_HEADER_RE.test(block)) score += 5;
      if (HUNK_RE.test(block)) score += 3;
      if (block.startsWith('diff --git')) score += 2;
      if (block.length > 200) score += 1;
      if (/\*\*\*\s*Begin Patch/.test(block) || /\*\*\*\s*Update File:/.test(block)) {
        score += 1;
      }
      return { block, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { rawBlocks: [], reason: 'no_scored_blocks' };
  }
  let best = scored[0];

  if (!DIFF_HEADER_RE.test(best.block) || !HUNK_RE.test(best.block)) {
    const normalized = normalizeBeginPatch(best.block);
    if (normalized && DIFF_HEADER_RE.test(normalized) && HUNK_RE.test(normalized)) {
      best = { block: normalized, score: (best.score ?? 0) + 3 };
    }
  }

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

function normalizeBeginPatch(markdown: string): string | undefined {
  const input = stripCarriageReturns(markdown);
  const beginMatch = input.match(BEGIN_PATCH_RE);
  if (!beginMatch) {
    return undefined;
  }
  const body = beginMatch[1].trim();
  if (!body) {
    return undefined;
  }

  const lines = body.split('\n');
  const fileBlocks: { path: string; hunks: string[] }[] = [];
  let currentFile: { path: string; hunks: string[] } | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const updateMatch = line.match(UPDATE_FILE_RE);
    if (updateMatch) {
      const rawPath = updateMatch[1].trim();
      if (!rawPath || rawPath.startsWith('/') || rawPath.includes('..')) {
        return undefined;
      }
      currentFile = { path: rawPath, hunks: [] };
      fileBlocks.push(currentFile);
      continue;
    }
    if (!currentFile) {
      continue;
    }
    if (line.startsWith('@@ ')) {
      currentFile.hunks.push(line);
      continue;
    }
    if (
      line.startsWith('+') ||
      line.startsWith('-') ||
      line.startsWith(' ') ||
      line === '\\ No newline at end of file'
    ) {
      currentFile.hunks.push(line);
    }
  }

  const safeFiles = fileBlocks.filter((f) => f.hunks.length > 0);
  if (!safeFiles.length) {
    return undefined;
  }

  const parts: string[] = [];
  for (const file of safeFiles) {
    const aPath = `a/${file.path}`;
    const bPath = `b/${file.path}`;
    parts.push(`diff --git ${aPath} ${bPath}`);
    parts.push(`--- ${aPath}`);
    parts.push(`+++ ${bPath}`);
    parts.push(...file.hunks);
  }

  const diff = parts.join('\n').trim();
  if (!DIFF_HEADER_RE.test(diff) || !HUNK_RE.test(diff)) {
    return undefined;
  }
  return diff;
}
