import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface GitResult {
  ok: boolean;
  stderr?: string;
  stdout?: string;
}

export type ApplyMode = 'none' | 'check' | 'apply' | 'commit';

interface RunGitOptions {
  cwd?: string;
}

function runGit(args: string[], options: RunGitOptions = {}): GitResult {
  const proc = spawnSync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
  });
  return {
    ok: proc.status === 0,
    stderr: proc.stderr || undefined,
    stdout: proc.stdout || undefined,
  };
}

export function validatePatch(patchPath: string, repoRoot: string): GitResult {
  return runGit(['apply', '--check', patchPath], { cwd: repoRoot });
}

export function applyPatch(patchPath: string, repoRoot: string): GitResult {
  return runGit(['apply', patchPath], { cwd: repoRoot });
}

export function getCurrentBranch(repoRoot: string): GitResult {
  return runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
}

export function commitAll(message: string, repoRoot: string): GitResult {
  const addResult = runGit(['add', '-A'], { cwd: repoRoot });
  if (!addResult.ok) {
    return {
      ok: false,
      stderr: addResult.stderr,
      stdout: addResult.stdout,
    };
  }
  return runGit(['commit', '-m', message], { cwd: repoRoot });
}

export function getHeadSha(repoRoot: string): GitResult {
  return runGit(['rev-parse', 'HEAD'], { cwd: repoRoot });
}

export function ensureGitRoot(gitRoot: string): void {
  const gitDir = path.join(gitRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error(`No .git directory found at ${gitRoot}. Use --git-root to point at a Git repository.`);
  }
}

export function validateDiffPaths(diffText: string, restrictPrefix: string): boolean {
  if (!restrictPrefix) {
    return true;
  }
  const normalizedPrefix = restrictPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const lines = diffText.split('\n');
  for (const line of lines) {
    if (!line.startsWith('diff --git ')) {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const aPath = parts[2]?.replace(/^a\//, '') ?? '';
    const bPath = parts[3]?.replace(/^b\//, '') ?? '';
    if (
      (aPath && !aPath.startsWith(normalizedPrefix)) ||
      (bPath && !bPath.startsWith(normalizedPrefix))
    ) {
      return false;
    }
  }
  return true;
}
