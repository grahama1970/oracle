import path from 'node:path';

export interface DiffHunk {
  header: string;
  lines: string[];
}

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

function isSafePath(p: string): boolean {
  if (!p) return false;
  if (p.trim() === '/dev/null') return true;
  const normalized = path.normalize(p);
  return (
    !path.isAbsolute(normalized) &&
    !normalized.startsWith('..') &&
    !normalized.includes('../') &&
    !normalized.includes('..\\') &&
    !normalized.includes('\0')
  );
}

function cleanDiffPath(p: string): string {
  const raw = p.trim();
  if (raw.startsWith('a/') || raw.startsWith('b/')) return raw.slice(2);
  return raw;
}

export function parseLenientDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = text.split(/\r?\n/);

  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  // Regex matchers
  const RE_GIT_HEADER = /^diff --git a\/(.*) b\/(.*)/;
  const RE_UPDATE_FILE = /^\*\*\*\s*Update File:\s*(.*)/i;
  const RE_TRIPLE_MINUS = /^---\s+(?:a\/)?(.*)/;
  const RE_HUNK_HEADER = /^@@\s*-[0-9,]+\s+\+[0-9,]+\s*@@/;
  const RE_NOISE_UPDATE = /^\*\*\*\s*UpdatePatch/i;
  const RE_BEGIN_PATCH = /\*\*\*\s*Begin Patch/i;
  const RE_END_PATCH = /\*\*\*\s*End Patch/i;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;

    // Skip known noise markers from Copilot artifacts.
    if (RE_NOISE_UPDATE.test(line) || RE_BEGIN_PATCH.test(line) || RE_END_PATCH.test(line)) {
      continue;
    }

    let newPath: string | null = null;

    const mGit = line.match(RE_GIT_HEADER);
    const mUpdate = line.match(RE_UPDATE_FILE);
    const mMinus = line.match(RE_TRIPLE_MINUS);

    if (mGit) newPath = mGit[1]!;
    else if (mUpdate) newPath = mUpdate[1]!;
    else if (mMinus && !currentHunk) newPath = mMinus[1]!;

    if (newPath) {
      const cleaned = cleanDiffPath(newPath);
      if (!isSafePath(cleaned)) {
        // eslint-disable-next-line no-console
        console.warn(`[lenientDiffParser] Ignoring unsafe path: ${cleaned}`);
        currentFile = null;
        currentHunk = null;
        continue;
      }

      currentFile = { path: cleaned, hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (RE_HUNK_HEADER.test(line)) {
      // If we see a hunk before a file header, attach it to the last file as a fallback.
      if (!currentFile && files.length > 0) {
        currentFile = files[files.length - 1]!;
      }
      if (currentFile) {
        currentHunk = { header: line.trim(), lines: [] };
        currentFile.hunks.push(currentHunk);
        continue;
      }
    }

    if (!currentFile) continue;

    if (currentHunk) {
      // Terminate hunk when we hit an obvious boundary (new file header, fenced block).
      if (RE_GIT_HEADER.test(line) || RE_UPDATE_FILE.test(line) || line.startsWith('```')) {
        currentHunk = null;
        continue;
      }

      const trimmed = line.trim();

      if (/^[+\- ]/.test(line) || trimmed === '') {
        currentHunk.lines.push(line);
      } else if (line.includes('Loadingsrc/') || line.includes('Loading...')) {
        // Skip spinner / loading noise lines without breaking the hunk.
        continue;
      } else if (!line.startsWith('***')) {
        // Leniently treat non-prefixed lines as context to cope with missing space prefixes.
        currentHunk.lines.push(` ${line}`);
      }
    }
  }

  return files.filter((f) => f.hunks.length > 0);
}

export function reconstructUnifiedDiff(files: DiffFile[]): string {
  const parts: string[] = [];

  for (const file of files) {
    parts.push(`diff --git a/${file.path} b/${file.path}`);
    parts.push(`--- a/${file.path}`);
    parts.push(`+++ b/${file.path}`);
    for (const hunk of file.hunks) {
      parts.push(hunk.header);
      parts.push(...hunk.lines);
    }
    parts.push('');
  }

  return parts.join('\n');
}
