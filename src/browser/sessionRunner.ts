import chalk from 'chalk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RunOracleOptions } from '../oracle.js';
import { formatElapsed } from '../oracle.js';
import type { BrowserSessionConfig, BrowserRuntimeMetadata } from '../sessionManager.js';
import { getSessionDir } from '../sessionManager.js';
import { runBrowserMode } from '../browserMode.js';
import type { BrowserRunResult } from '../browserMode.js';
import { assembleBrowserPrompt } from './prompt.js';
import { BrowserAutomationError } from '../oracle/errors.js';
import type { BrowserLogger, DiffRunStatus } from './types.js';
import { extractUnifiedDiff, isValidUnifiedDiff } from './diffExtractor.js';
import { scanForSecrets, sanitizeSecrets, writeJsonOutput } from './utils.js';
import {
  applyPatch,
  commitAll,
  ensureGitRoot,
  getCurrentBranch,
  getHeadSha,
  validateDiffPaths,
  validatePatch,
} from './gitIntegration.js';
import { buildFollowupPrompt, shouldRetry } from './retryStrategy.js';

export interface BrowserExecutionResult {
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  elapsedMs: number;
  runtime: BrowserRuntimeMetadata;
  status: DiffRunStatus;
  diffPath?: string;
  retryCount?: number;
  commitSha?: string;
  patchBytes?: number;
  promptChars?: number;
  responseChars?: number;
  secretScan?: {
    status: 'ok' | 'matches_detected';
    matches: string[];
  };
  snapshots?: string[];
}

interface RunBrowserSessionArgs {
  runOptions: RunOracleOptions;
  browserConfig: BrowserSessionConfig;
  cwd: string;
  log: (message?: string) => void;
  cliVersion: string;
}

interface BrowserSessionRunnerDeps {
  assemblePrompt?: typeof assembleBrowserPrompt;
  executeBrowser?: typeof runBrowserMode;
}

export async function runBrowserSessionExecution(
  { runOptions, browserConfig, cwd, log, cliVersion }: RunBrowserSessionArgs,
  deps: BrowserSessionRunnerDeps = {},
): Promise<BrowserExecutionResult> {
  const assemblePrompt = deps.assemblePrompt ?? assembleBrowserPrompt;
  const executeBrowser = deps.executeBrowser ?? runBrowserMode;
  const promptArtifacts = await assemblePrompt(runOptions, { cwd });
  if (runOptions.verbose) {
    log(
      chalk.dim(
        `[verbose] Browser config: ${JSON.stringify({
          ...browserConfig,
        })}`,
      ),
    );
    log(chalk.dim(`[verbose] Browser prompt length: ${promptArtifacts.composerText.length} chars`));
    if (promptArtifacts.attachments.length > 0) {
      const attachmentList = promptArtifacts.attachments.map((attachment) => attachment.displayPath).join(', ');
      log(chalk.dim(`[verbose] Browser attachments: ${attachmentList}`));
      if (promptArtifacts.bundled) {
        log(
          chalk.yellow(
            `[browser] More than 10 files provided; bundled ${promptArtifacts.bundled.originalCount} files into ${promptArtifacts.bundled.bundlePath} to satisfy ChatGPT upload limits.`,
          ),
        );
      }
    } else if (runOptions.file && runOptions.file.length > 0 && runOptions.browserInlineFiles) {
      log(chalk.dim('[verbose] Browser inline file fallback enabled (pasting file contents).'));
    }
  }
  const headerLine = `Oracle (${cliVersion}) launching browser mode (${runOptions.model}) with ~${promptArtifacts.estimatedInputTokens.toLocaleString()} tokens`;
  const automationLogger: BrowserLogger = ((message?: string) => {
    if (typeof message === 'string') {
      log(message);
    }
  }) as BrowserLogger;
  automationLogger.verbose = Boolean(runOptions.verbose);
  automationLogger.sessionLog = log;

  const secretMatches = runOptions.secretScan || runOptions.sanitizePrompt
    ? scanForSecrets(promptArtifacts.composerText)
    : [];
  const secretSummary =
    secretMatches.length > 0
      ? {
          status: 'matches_detected' as const,
          matches: secretMatches.map((entry) => entry.pattern),
        }
      : { status: 'ok' as const, matches: [] as string[] };
  let composerText = promptArtifacts.composerText;
  if (secretMatches.length > 0 && runOptions.sanitizePrompt) {
    composerText = sanitizeSecrets(composerText, secretMatches);
  }
  if (secretMatches.length > 0 && runOptions.secretScan) {
    log(chalk.red('Secret-like data detected in the prompt; aborting browser run (--secret-scan).'));
    const sessionId = runOptions.sessionId;
    const sessionDir = sessionId ? getSessionDir(sessionId) : cwd;
    const jsonPath = runOptions.jsonOutput ?? `${sessionDir}/result.json`;
    await writeJsonOutput(jsonPath, {
      status: 'secret_detected',
      diffFound: false,
      diffValidated: false,
      diffApplied: false,
      applyMode: runOptions.applyMode ?? 'none',
      branch: runOptions.branch,
      retryCount: 0,
      elapsedMs: 0,
      promptChars: composerText.length,
      responseChars: 0,
      patchBytes: 0,
      secretScan: secretSummary,
    });
    return {
      usage: {
        inputTokens: promptArtifacts.estimatedInputTokens,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: promptArtifacts.estimatedInputTokens,
      },
      elapsedMs: 0,
      runtime: {},
      status: 'secret_detected',
      diffPath: undefined,
      retryCount: 0,
      commitSha: undefined,
      patchBytes: 0,
      promptChars: composerText.length,
      responseChars: 0,
      secretScan: secretSummary,
      snapshots: [],
    };
  }

  const sessionId = runOptions.sessionId;
  const sessionDir = sessionId ? getSessionDir(sessionId) : cwd;
  const gitRoot = runOptions.gitRoot ?? cwd;
  const applyMode = runOptions.applyMode ?? 'none';
  const maxRetries = typeof runOptions.maxRetries === 'number' ? runOptions.maxRetries : 1;
  const diffOutputPath = runOptions.diffOutput ?? `${sessionDir}/diff.patch`;
  const jsonOutputPath = runOptions.jsonOutput ?? `${sessionDir}/result.json`;
  const metricsOutputPath = runOptions.metricsOutput ?? `${sessionDir}/metrics.json`;

  log(headerLine);
  log(chalk.dim('Chrome automation does not stream output; this may take a minute...'));
  let attempt = 0;
  let retryCount = 0;
  let finalStatus: DiffRunStatus = 'diff_missing';
  let finalDiffPath: string | undefined;
  let finalCommitSha: string | undefined;
  let finalPatchBytes = 0;
  let responseChars = 0;
  let gitApplyError: string | undefined;
  let gitCommitError: string | undefined;
  let diffScore: number | undefined;
  let diffBlocks: number | undefined;
  let diffReason: string | undefined;
  let lastBrowserResult: BrowserRunResult | null = null;
  const startedAt = Date.now();

  const metrics = {
    phases: [] as Array<{ phase: string; startedAt: number; completedAt: number }>,
  };

  const recordPhase = (phase: string, started: number, completed: number) => {
    metrics.phases.push({ phase, startedAt: started, completedAt: completed });
  };

  while (true) {
    const phaseStart = Date.now();
    let browserResult: BrowserRunResult;
    try {
      browserResult = await executeBrowser({
        prompt: attempt === 0 ? composerText : buildFollowupPrompt(composerText, runOptions.followupPrompt),
        attachments: promptArtifacts.attachments,
        config: browserConfig,
        log: automationLogger,
        heartbeatIntervalMs: runOptions.heartbeatIntervalMs,
        verbose: runOptions.verbose,
        domSnapshotIntervalMs: runOptions.domSnapshotIntervalMs,
        snapshotsDir: sessionDir,
      });
    } catch (error) {
      if (error instanceof BrowserAutomationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Browser automation failed.';
      throw new BrowserAutomationError(message, { stage: 'execute-browser' }, error);
    }
    const phaseEnd = Date.now();
    recordPhase(`attempt-${attempt}`, phaseStart, phaseEnd);
    lastBrowserResult = browserResult;

    if (!runOptions.silent) {
      log(chalk.bold('Answer:'));
      log(browserResult.answerMarkdown || browserResult.answerText || chalk.dim('(no text output)'));
      log('');
    }

    responseChars = (browserResult.answerMarkdown || browserResult.answerText || '').length;
    const diffSource = browserResult.answerMarkdown || browserResult.answerText || '';
    const extraction = extractUnifiedDiff(diffSource);
    diffScore = extraction.score;
    diffBlocks = extraction.rawBlocks.length;
    diffReason = extraction.reason;
    const diffText = extraction.selectedBlock;
    const diffFound = Boolean(diffText);
    const strict = Boolean(runOptions.strictDiff);
    const valid = isValidUnifiedDiff(diffText, strict);
    const partial = extraction.reason === 'partial_fence';

    if (diffFound && valid) {
      finalStatus = 'success';
      if (runOptions.restrictPathPrefix && diffText && !validateDiffPaths(diffText, runOptions.restrictPathPrefix)) {
        finalStatus = 'invalid_diff';
      } else {
        const diffDir = path.dirname(diffOutputPath);
        await mkdir(diffDir, { recursive: true });
        await writeFile(diffOutputPath, diffText, 'utf8');
        finalDiffPath = diffOutputPath;
        finalPatchBytes = Buffer.byteLength(diffText, 'utf8');
        if (applyMode && applyMode !== 'none') {
          await ensureGitRoot(gitRoot);
          const validation = validatePatch(diffOutputPath, gitRoot);
          if (!validation.ok) {
            finalStatus = 'apply_failed';
            gitApplyError = validation.stderr;
          } else if (applyMode === 'check') {
            // no-op; validation already done
          } else {
            const applied = applyPatch(diffOutputPath, gitRoot);
            if (!applied.ok) {
              finalStatus = 'apply_failed';
              gitApplyError = applied.stderr;
            } else if (applyMode === 'commit') {
              const commitMessage = runOptions.commitMessage ?? 'oracle: apply assistant patch';
              const committed = commitAll(commitMessage, gitRoot);
              if (!committed.ok) {
                finalStatus = 'commit_failed';
                gitCommitError = committed.stderr;
              } else {
                const head = getHeadSha(gitRoot);
                if (head.ok && head.stdout) {
                  finalCommitSha = head.stdout.trim();
                }
              }
            }
          }
        }
      }
      break;
    }

    if (partial && runOptions.exitOnPartial) {
      finalStatus = 'partial';
      break;
    }

    retryCount = attempt;
    const should = shouldRetry(valid, attempt, maxRetries);
    if (!should || !runOptions.retryIfNoDiff) {
      finalStatus = valid ? 'success' : diffFound ? 'invalid_diff' : 'diff_missing';
      break;
    }
    attempt += 1;
    retryCount = attempt;
  }

  const elapsedMs = Date.now() - startedAt;
  const usage = {
    inputTokens: promptArtifacts.estimatedInputTokens,
    outputTokens: lastBrowserResult?.answerTokens ?? 0,
    reasoningTokens: 0,
    totalTokens: promptArtifacts.estimatedInputTokens + (lastBrowserResult?.answerTokens ?? 0),
  };
  const tokensDisplay = `${usage.inputTokens}/${usage.outputTokens}/${usage.reasoningTokens}/${usage.totalTokens}`;
  const statsParts = [`${runOptions.model}[browser]`, `tok(i/o/r/t)=${tokensDisplay}`];
  if (runOptions.file && runOptions.file.length > 0) {
    statsParts.push(`files=${runOptions.file.length}`);
  }
  log(chalk.blue(`Finished in ${formatElapsed(elapsedMs)} (${statsParts.join(' | ')})`));

  const resultPayload = {
    status: finalStatus,
    diffFound: Boolean(finalDiffPath),
    diffValidated: finalStatus === 'success' || finalStatus === 'apply_failed' || finalStatus === 'commit_failed',
    diffApplied: finalStatus === 'success',
    applyMode,
    branch: runOptions.branch,
    commitSha: finalCommitSha,
    retryCount,
    elapsedMs,
    promptChars: composerText.length,
    responseChars,
    patchBytes: finalPatchBytes,
    diffPath: finalDiffPath,
    secretScan: secretSummary,
    snapshots: lastBrowserResult?.snapshots ?? [],
    diffScore,
    diffBlocks,
    diffReason,
    gitApplyError,
    gitCommitError,
  };
  await writeJsonOutput(jsonOutputPath, resultPayload);
  await writeJsonOutput(metricsOutputPath, {
    status: finalStatus,
    elapsedMs,
    phases: metrics.phases,
  });

  const runtime: BrowserRuntimeMetadata = {
    chromePid: lastBrowserResult?.chromePid,
    chromePort: lastBrowserResult?.chromePort,
    userDataDir: lastBrowserResult?.userDataDir,
  };

  return {
    usage,
    elapsedMs,
    runtime,
    status: finalStatus,
    diffPath: finalDiffPath,
    retryCount,
    commitSha: finalCommitSha,
    patchBytes: finalPatchBytes,
    promptChars: composerText.length,
    responseChars,
    secretScan: secretSummary,
    snapshots: lastBrowserResult?.snapshots ?? [],
    // auxiliary diagnostics (not yet persisted into SessionMetadata)
    // to help downstream tooling when needed
    // diffScore,
    // diffBlocks,
    // diffReason,
    // gitApplyError,
    // gitCommitError,
  };
}
