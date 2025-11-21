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
  if (!p || p.trim() === '/dev/null') return true;
  const normalized = path.normalize(p);
  return !path.isAbsolute(normalized) && !normalized.startsWith('..') && !normalized.includes('\0');
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

  const RE_GIT_HEADER = /^diff --git a\/(.*) b\/(.*)/;
  const RE_UPDATE_FILE = /^\*\*\*\s*Update File:\s*(.*)/i;
  const RE_TRIPLE_MINUS = /^---\s+(?:a\/)?(.*)/;
  const RE_HUNK_HEADER = /^@@\s*-[0-9,]+\s+\+[0-9,]+\s*@@/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;

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

    if (!currentFile) continue;

    if (RE_HUNK_HEADER.test(line)) {
      currentHunk = { header: line.trim(), lines: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk) {
      if (/^[+\- ]/.test(line) || line.trim() === '') {
        currentHunk.lines.push(line);
      } else if (line.startsWith('```') || line.startsWith('*** End')) {
        currentHunk = null;
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

