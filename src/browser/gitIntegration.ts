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
  // First attempt
  let addResult = runGit(['add', '-A'], { cwd: repoRoot });
  if (!addResult.ok) {
    // Check for index lock
    if (addResult.stderr && addResult.stderr.includes('Unable to create') && addResult.stderr.includes('.git/index.lock')) {
      const lockMatch = addResult.stderr.match(/'(.+\.git\/index\.lock)'/);
      if (lockMatch && lockMatch[1] && fs.existsSync(lockMatch[1])) {
        try {
          fs.unlinkSync(lockMatch[1]);
          // Retry add
          addResult = runGit(['add', '-A'], { cwd: repoRoot });
        } catch (e) {
          // Ignore unlink error, let it fail naturally
        }
      }
    }

    if (!addResult.ok) {
      return {
        ok: false,
        stderr: addResult.stderr,
        stdout: addResult.stdout,
      };
    }
  }

  // Check if there are staged changes
  const diffResult = runGit(['diff', '--staged', '--quiet'], { cwd: repoRoot });
  if (diffResult.ok) { // exit code 0 means no differences
    return {
      ok: false,
      stderr: 'No staged changes to commit.',
    };
  }

  let commitResult = runGit(['commit', '-m', message], { cwd: repoRoot });

  // Handle commit lock if it wasn't the add lock
  if (!commitResult.ok && commitResult.stderr && commitResult.stderr.includes('.git/index.lock')) {
    const lockMatch = commitResult.stderr.match(/'(.+\.git\/index\.lock)'/);
    if (lockMatch && lockMatch[1] && fs.existsSync(lockMatch[1])) {
      try {
        fs.unlinkSync(lockMatch[1]);
        // Retry commit
        commitResult = runGit(['commit', '-m', message], { cwd: repoRoot });
      } catch (e) {
        // Ignore
      }
    }
  }

  return commitResult;
}

export function push(repoRoot: string, remote: string = 'origin', branch?: string): GitResult {
  const args = ['push', remote];
  if (branch) {
    args.push(branch);
  } else {
    // If no branch specified, push the current branch
    const current = getCurrentBranch(repoRoot);
    if (current.ok && current.stdout) {
      args.push(current.stdout.trim());
    }
  }
  return runGit(args, { cwd: repoRoot });
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
