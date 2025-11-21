#!/usr/bin/env tsx

/**
 * Copilot code-review proof-of-concept script.
 *
 * - Reads a markdown review request template (default: docs/templates/COPILOT_CODE_REVIEW.md)
 * - Sends it to GitHub Copilot Web via the existing browser engine
 * - Targets the GPT-5 picker entry by default (configurable via --model)
 * - Optionally runs multiple rounds with Copilot (up to --max-turns)
 *   and applies diffs it concurs with via git.
 *
 * Project agents remain responsible for editing the template and deciding
 * which repo/branch/diff to describe.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runBrowserMode, type BrowserAutomationConfig } from '../src/browserMode.js';
import { parseLenientDiff, reconstructUnifiedDiff } from '../src/browser/lenientDiffParser.js';
import { applyPatch, validatePatch, ensureGitRoot } from '../src/browser/gitIntegration.js';

function normalizeAssistantOutput(answer: string): string {
  if (!answer) return '';
  // Treat obvious HTML responses from Copilot as markup and strip tags so the diff
  // extractor sees the actual patch text instead of `<span>` wrappers.
  if (!/[<>]/.test(answer)) {
    return answer.trim();
  }
  return answer
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d)>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function writeAnswerArtifacts(basePath: string, normalized: string, raw: string) {
  await writeFile(basePath, normalized, 'utf8');
  if (raw === normalized) {
    return;
  }
  const htmlPath = basePath.endsWith('.txt') ? basePath.replace(/\.txt$/, '.html') : `${basePath}.html`;
  await writeFile(htmlPath, raw, 'utf8');
}

function resolveDesiredModelLabel(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) {
    return 'GPT-5';
  }
  const lower = value.toLowerCase();
  if (lower === 'gpt-5-pro') {
    return 'GPT-5 Pro';
  }
  if (lower === 'gpt-5.1' || lower === 'gpt-5') {
    return 'GPT-5';
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  let templateArg: string | undefined;
  let modelArg: string | undefined;
  let maxTurns = 3;
  let applyMode: 'none' | 'check' | 'apply' = 'none';
  const extraParts: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--model' && i + 1 < args.length) {
      modelArg = args[i + 1];
      i += 1;
      continue;
    }
    if ((arg === '--max-turns' || arg === '--maxTurns') && i + 1 < args.length) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxTurns = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--apply-mode' && i + 1 < args.length) {
      const mode = args[i + 1] as typeof applyMode;
      if (mode === 'none' || mode === 'check' || mode === 'apply') {
        applyMode = mode;
      }
      i += 1;
      continue;
    }
    if (!arg.startsWith('-') && !templateArg) {
      templateArg = arg;
      continue;
    }
    extraParts.push(arg);
  }

  const templatePath =
    templateArg && !templateArg.startsWith('-')
      ? templateArg
      : path.join(process.cwd(), 'docs', 'templates', 'COPILOT_CODE_REVIEW.md');

  const extraText = extraParts.join(' ').trim();

  const resolvedTemplatePath = path.isAbsolute(templatePath)
    ? templatePath
    : path.join(process.cwd(), templatePath);

  const promptBody = await readFile(resolvedTemplatePath, 'utf8');
  const prompt =
    extraText.length > 0
      ? `${promptBody.trim()}\n\n---\n\nAdditional context from caller:\n\n${extraText}`
      : promptBody;

  const chromeProfile = process.env.CHROME_PROFILE_DIR || `${process.env.HOME}/.oracle/chrome-profile`;
  const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
  const remoteDebugUrl = process.env.CHROME_REMOTE_DEBUG_URL || undefined;
  const remoteDebugPort = process.env.CHROME_REMOTE_DEBUG_PORT
    ? Number(process.env.CHROME_REMOTE_DEBUG_PORT)
    : undefined;
  const desiredModel = resolveDesiredModelLabel(modelArg);

  // Keep the smoke run bounded so it doesn't "hang" on long Copilot responses.
  const SMOKE_TIMEOUT_MS = 120_000;

  const config: BrowserAutomationConfig = {
    chromeProfile,
    chromePath,
    url: 'https://github.com/copilot/',
    timeoutMs: SMOKE_TIMEOUT_MS,
    inputTimeoutMs: 30_000,
    cookieSync: remoteDebugUrl || remoteDebugPort ? false : true,
    // Headful debug mode for Copilot POC so we can inspect the DOM, but close the browser when done.
    headless: false,
    keepBrowser: false,
    hideWindow: false,
    remoteDebugUrl,
    remoteDebugPort,
    // Target the GPT-5/GPT-5 Pro picker labels for browser runs.
    desiredModel,
    debug: true,
    allowCookieErrors: true,
  };

  const log = (message?: string) => {
    if (typeof message === 'string') {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  };

  try {
    const tmpDir = path.join(process.cwd(), 'tmp');
    await mkdir(tmpDir, { recursive: true });
    const slug = path.basename(resolvedTemplatePath).replace(/\.[^.]+$/, '') || 'copilot-review';

    console.log(
      `Starting Copilot code-review run with template:\n  ${resolvedTemplatePath}\n  (length: ${prompt.length} chars)`,
    );
    console.log(`Model: ${desiredModel}`);
    console.log(`Max turns: ${maxTurns}`);
    console.log(`Apply mode: ${applyMode}`);

    let currentPrompt = prompt;
    let turn = 0;
    let lastDiff: string | undefined;
    let hasDiff = false;

    while (turn < maxTurns) {
      turn += 1;
      console.log(`\n=== Copilot round ${turn}/${maxTurns} ===`);
      const result = await runBrowserMode({
        prompt: currentPrompt,
        attachments: [],
        config,
        log,
        heartbeatIntervalMs: 30_000,
        verbose: true,
      });

      const rawAnswer = result.answerMarkdown || result.answerText || '';
      const answer = normalizeAssistantOutput(rawAnswer);
      if (rawAnswer !== answer) {
        console.log('[oracle] Normalized Copilot HTML response before diff extraction.');
      }
      console.log('\n--- Copilot Response (truncated preview) ---');
      console.log(`${answer.slice(0, 800)}${answer.length > 800 ? '\n…' : ''}`);

      let patch: string | undefined;
      let patchPath: string | undefined;
      hasDiff = false;
      try {
        // Prefer patchSource (clipboard-based) when available, otherwise use normalized markdown.
        const diffSource = (result.patchSource && result.patchSource.trim().length > 0) ? result.patchSource : answer;
        const parsedFiles = parseLenientDiff(diffSource);

        if (parsedFiles.length === 0) {
          const noDiffPath = path.join(tmpDir, `${slug}-copilot-review-no-diff.txt`);
          await writeAnswerArtifacts(noDiffPath, answer, rawAnswer);
          console.log(`[oracle] No parseable diff hunks found; wrote ${noDiffPath}`);
          break;
        }

        patch = reconstructUnifiedDiff(parsedFiles);
        patchPath = path.join(tmpDir, `${slug}-copilot-review-turn-${turn}.patch`);
        await writeFile(patchPath, patch, 'utf8');
        console.log(
          `\n[oracle] Extracted patch for round ${turn} (${parsedFiles.length} file(s)) -> ${patchPath}`,
        );
        lastDiff = patch;
        hasDiff = true;

        if (applyMode !== 'none') {
          const gitRoot = process.cwd();
          ensureGitRoot(gitRoot);
          const validation = validatePatch(patchPath, gitRoot);
          if (!validation.ok) {
            console.log('[oracle] Patch validation failed; not applying.');
            console.log(validation.stderr ?? '');
          } else if (applyMode === 'check') {
            console.log('[oracle] Patch validated (--apply-mode=check); no changes applied.');
          } else if (applyMode === 'apply') {
            const applied = applyPatch(patchPath, gitRoot);
            if (!applied.ok) {
              console.log('[oracle] Patch apply failed:');
              console.log(applied.stderr ?? '');
            } else {
              console.log('[oracle] Patch applied successfully (--apply-mode=apply).');
            }
          }
        }
      } catch (err) {
        const invalidPath = path.join(tmpDir, `${slug}-copilot-review-invalid-diff.txt`);
        await writeAnswerArtifacts(invalidPath, answer, rawAnswer);
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[oracle] Failed to extract a valid diff: ${msg}; wrote ${invalidPath}`);
        break;
      }

      if (turn >= maxTurns) {
        break;
      }

      // Build a follow-up prompt based on whether we saw a diff.
      if (hasDiff && lastDiff) {
        currentPrompt = [
          'You previously proposed the following unified diff, which has now been validated and (if requested) applied locally:',
          '',
          '```diff',
          lastDiff.trim(),
          '```',
          '',
          'Please either:',
          '1. Reply with the single word "DONE" if no further changes are needed, or',
          '2. Provide an additional unified diff with incremental improvements, in the same format and constraints as before.',
        ].join('\n');
      } else {
        currentPrompt = [
          'Your previous response did not include a valid unified diff in the requested format.',
          'Please respond with a single fenced ```diff block containing the patch that satisfies the original constraints.',
        ].join('\n');
      }
    }

    console.log('\n=== Copilot code-review session complete ===');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('Copilot code-review POC failed:', message);
    process.exitCode = 1;
  }
}

void main();
