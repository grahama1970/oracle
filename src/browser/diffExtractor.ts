import { BrowserAutomationError } from '../oracle/errors.js';

export interface DiffExtractionResult {
  rawBlocks: string[];
  selectedBlock?: string;
  score?: number;
  reason?: string;
  sidebarDetected?: boolean;
  completionPath?: string;
  signals?: any;
}

const FENCE_RE = /```[^\n]*\n([\s\S]*?)```/g;
const HUNK_RE = /@@ -\d+,\d+ \+\d+,\d+ @@/;
const DIFF_HEADER_RE = /^diff --git /m;
const BEGIN_PATCH_RE = /^\*\*\*\s*Begin Patch[\r\n]+([\s\S]*?)^\*\*\*\s*End Patch\s*$/im;
const UPDATE_FILE_RE = /^\*\*\*\s*Update File:\s*(.+)$/im;

function stripCarriageReturns(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

/**
 * Check if the patch source contains sidebar/navigation content
 */
export function detectSidebarBleed(patchSource: string): { hasBleed: boolean; indicators: string[] } {
  // Common sidebar indicators from GitHub Copilot interface
  const sidebarIndicators = [
    'Pull requests',
    'Issues',
    'Marketplace',
    'Explore',
    'Navigation',
    'aria-label',
    'data-testid',
    'copilot-sidebar',
    '.copilot-toolbar',
    'action-list',
    '\[role="navigation"\]',
    'header',
    'nav'
  ];

  const foundIndicators: string[] = [];
  for (const indicator of sidebarIndicators) {
    if (patchSource.toLowerCase().includes(indicator.toLowerCase())) {
      foundIndicators.push(indicator);
    }
  }

  return {
    hasBleed: foundIndicators.length > 3, // Require at least 3 indicators for certainty
    indicators: foundIndicators
  };
}

export function extractUnifiedDiff(markdown: string, options?: {
  completionPath?: string;
  signals?: any;
  checkForSidebarBleed?: boolean;
}): DiffExtractionResult {
  if (!markdown) {
    return { rawBlocks: [], reason: 'empty' };
  }

  // Check for sidebar bleed if requested
  const bleedCheck = options?.checkForSidebarBleed ? detectSidebarBleed(markdown) : { hasBleed: false, indicators: [] };

  const fencedMatches = [...markdown.matchAll(FENCE_RE)];
  const fenced = fencedMatches.map((match) => stripCarriageReturns(match[1].trim()));

  if (!fenced.length) {
    const hasPartialFence = markdown.includes('```diff') || markdown.includes('```patch');
    const normalizedFromBeginPatch = normalizeBeginPatch(markdown);
    if (normalizedFromBeginPatch) {
      return {
        rawBlocks: [normalizedFromBeginPatch],
        selectedBlock: normalizedFromBeginPatch,
        score: 6,
        reason: 'normalized_begin_patch',
        sidebarDetected: bleedCheck.hasBleed,
        completionPath: options?.completionPath,
        signals: options?.signals,
      };
    }

    // If sidebar bleed detected and no valid diffs, indicate potential extraction issue
    if (bleedCheck.hasBleed) {
      return {
        rawBlocks: [],
        reason: 'sidebar_bleed_detected',
        sidebarDetected: true,
        completionPath: options?.completionPath,
        signals: options?.signals,
      };
    }

    return {
      rawBlocks: [],
      reason: hasPartialFence ? 'partial_fence' : 'no_fenced_blocks'
    };
  }
  const scored = fenced
    .map((rawBlock) => {
      // Attempt to normalize patch-marker style blocks inside fenced code that
      // lack diff headers (e.g., a fenced ```patch block containing *** Begin Patch).
      let block = rawBlock;
      let normalizedApplied = false;
      if ((!DIFF_HEADER_RE.test(block) || !HUNK_RE.test(block)) && /\*\*\*\s*Begin Patch/.test(block)) {
        const normalized = normalizeBeginPatch(block);
        if (normalized) {
          block = normalized;
          normalizedApplied = true;
        }
      }
      let score = 0;
      if (DIFF_HEADER_RE.test(block)) score += 5;
      if (HUNK_RE.test(block)) score += 3;
      if (block.startsWith('diff --git')) score += 2;
      if (block.length > 200) score += 1;
      if (/\*\*\*\s*Begin Patch/.test(block) || /\*\*\*\s*Update File:/.test(block)) {
        score += 1;
      }
      if (normalizedApplied) {
        score += 2; // Reward successful normalization.
      }
      return { block, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    // If sidebar bleed detected with no valid scores, indicate potential extraction issue
    if (bleedCheck.hasBleed) {
      return {
        rawBlocks: [],
        reason: 'sidebar_bleed_detected',
        sidebarDetected: true,
        completionPath: options?.completionPath,
        signals: options?.signals,
      };
    }
    return { rawBlocks: [], reason: 'no_scored_blocks' };
  }
  let best = scored[0];

  if (!DIFF_HEADER_RE.test(best.block) || !HUNK_RE.test(best.block)) {
    const normalized = normalizeBeginPatch(best.block);
    if (normalized && DIFF_HEADER_RE.test(normalized) && HUNK_RE.test(normalized)) {
      best = { block: normalized, score: (best.score ?? 0) + 3 };
    }
    // Secondary global normalization attempt when fenced blocks exist but top block failed.
    if ((!DIFF_HEADER_RE.test(best.block) || !HUNK_RE.test(best.block)) && /\*\*\*\s*Begin Patch/.test(markdown)) {
      const globalNormalized = normalizeBeginPatch(markdown);
      if (globalNormalized && DIFF_HEADER_RE.test(globalNormalized) && HUNK_RE.test(globalNormalized)) {
        best = { block: globalNormalized, score: (best.score ?? 0) + 4 };
      }
    }
  }

  // Additional validation: if sidebar bleed detected but we have a valid diff, add warning
  const result = {
    rawBlocks: scored.map((entry) => entry.block),
    selectedBlock: best.block,
    score: best.score,
    reason: DIFF_HEADER_RE.test(best.block) && HUNK_RE.test(best.block) ? undefined : 'no_valid_unified_diff',
    sidebarDetected: bleedCheck.hasBleed,
    completionPath: options?.completionPath,
    signals: options?.signals,
  };

  // If sidebar bleed detected with no valid diff, invalidate the result
  if (bleedCheck.hasBleed && (!DIFF_HEADER_RE.test(best.block) || !HUNK_RE.test(best.block))) {
    result.reason = 'sidebar_bleed_no_valid_diff';
  }

  return result;
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
