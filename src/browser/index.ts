import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveBrowserConfig } from './config.js';
import type { BrowserRunOptions, BrowserRunResult, BrowserLogger, ChromeClient, BrowserAttachment } from './types.js';
import { launchChrome, registerTerminationHooks, hideChromeWindow, connectToChrome } from './chromeLifecycle.js';
import { syncCookies } from './cookies.js';
import {
  navigateToChatGPT,
  ensureNotBlocked,
  ensurePromptReady,
  ensureModelSelection,
  submitPrompt,
  waitForAssistantResponse,
  captureAssistantMarkdown,
  uploadAttachmentFile,
  waitForAttachmentCompletion,
  readAssistantSnapshot,
  // Copilot-specific imports
  detectTarget,
  navigateToCopilot,
  checkCopilotAuthentication,
  ensureCopilotPromptReady,
  waitForCopilotResponse,
} from './pageActions.js';
import { estimateTokenCount, withRetries } from './utils.js';
import { formatElapsed } from '../oracle/format.js';

export type { BrowserAutomationConfig, BrowserRunOptions, BrowserRunResult } from './types.js';
export { CHATGPT_URL, DEFAULT_MODEL_TARGET } from './constants.js';
export { parseDuration, delay } from './utils.js';

export async function runBrowserMode(options: BrowserRunOptions): Promise<BrowserRunResult> {
  const promptText = options.prompt?.trim();
  if (!promptText) {
    throw new Error('Prompt text is required when using browser mode.');
  }

  const attachments: BrowserAttachment[] = options.attachments ?? [];

  const config = resolveBrowserConfig(options.config);
  const logger: BrowserLogger = options.log ?? ((_message: string) => {});
  if (logger.verbose === undefined) {
    logger.verbose = Boolean(config.debug);
  }
  if (logger.sessionLog === undefined && options.log?.sessionLog) {
    logger.sessionLog = options.log.sessionLog;
  }
  if (config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') {
    logger(
      `[browser-mode] config: ${JSON.stringify({
        ...config,
        promptLength: promptText.length,
      })}`,
    );
  }

  const useRemoteChrome = Boolean(config.remoteDebugUrl || config.remoteDebugPort);
  let userDataDir: string | null = null;
  let chrome: Awaited<ReturnType<typeof launchChrome>> | null = null;
  let removeTerminationHooks: (() => void) | null = null;

  if (!useRemoteChrome) {
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-browser-'));
    logger(`Created temporary Chrome profile at ${userDataDir}`);
    chrome = await launchChrome(config, userDataDir, logger);
    try {
      removeTerminationHooks = registerTerminationHooks(chrome, userDataDir, config.keepBrowser, logger);
    } catch {
      // ignore failure; cleanup still happens below
    }
  } else {
    const remoteLabel = config.remoteDebugUrl ?? `port ${config.remoteDebugPort ?? 9222}`;
    logger(`Using existing Chrome via remote debugging (${remoteLabel})`);
  }

  let client: Awaited<ReturnType<typeof connectToChrome>> | null = null;
  const startedAt = Date.now();
  let answerText = '';
  let answerMarkdown = '';
  let answerHtml = '';
  let runStatus: 'attempted' | 'complete' = 'attempted';
  let connectionClosedUnexpectedly = false;
  let stopThinkingMonitor: (() => void) | null = null;
  let stopSnapshotMonitor: (() => void) | null = null;
  const snapshotPaths: string[] = [];

  try {
    const connectionTarget = chrome
      ? { port: chrome.port }
      : config.remoteDebugUrl
        ? { browserURL: config.remoteDebugUrl }
        : { port: config.remoteDebugPort ?? 9222 };
    client = await connectToChrome(connectionTarget, logger);
    const markConnectionLost = () => {
      connectionClosedUnexpectedly = true;
    };
    client.on('disconnect', markConnectionLost);
    const { Network, Page, Runtime, Input, DOM, Browser } = client;

    if (!config.headless && config.hideWindow) {
      await hideChromeWindow(chrome, logger);
    }

    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === 'function') {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);

    if (!useRemoteChrome) {
      await Network.clearBrowserCookies();

      if (config.cookieSync) {
        const cookieCount = await syncCookies(
          Network,
          config.url,
          config.chromeProfile,
          logger,
          config.allowCookieErrors ?? false,
        );
        logger(
          cookieCount > 0
            ? `Copied ${cookieCount} cookies from Chrome profile ${config.chromeProfile ?? 'Default'}`
            : 'No Chrome cookies found; continuing without session reuse',
        );
      } else {
        logger('Skipping Chrome cookie sync (--browser-no-cookie-sync)');
      }
    } else {
      logger('Remote debugging session detected; skipping cookie clearing/sync and using existing profile.');
    }

    // Detect target platform
    const target = detectTarget(config.url);
    logger(`Detected target platform: ${target}`);

    if (target === 'copilot') {
      // Copilot-specific flow
      logger('Using Copilot-specific flow...');
      await navigateToCopilot(Page, Runtime, logger);
      await ensureNotBlocked(Runtime, config.headless, logger);

      // Check authentication without blocking
      const isAuthenticated = await checkCopilotAuthentication(Runtime, logger);
      if (!isAuthenticated && !config.headless) {
        logger('⚠️  GitHub Copilot authentication required');
        logger('Please authenticate manually in the browser window');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Ensure Copilot input is ready
      const inputElement = await ensureCopilotPromptReady(Runtime, config.inputTimeoutMs, logger);
      if (!inputElement) {
        throw new Error('Could not find Copilot input element');
      }
      logger(`Copilot input ready '${inputElement}' (${promptText.length.toLocaleString()} chars queued)`);

      // Use model selection for Copilot if desiredModel is specified
      if (config.desiredModel) {
        // Import Copilot model selection function
        const { ensureCopilotModelSelection } = await import('./actions/copilotModelSelection.js');
        await withRetries(
          () => ensureCopilotModelSelection(Runtime, config.desiredModel as string, logger),
          {
            retries: 2,
            delayMs: 300,
            onRetry: (attempt, error) => {
              if (options.verbose) {
                logger(`[retry] Copilot model selection attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
              }
            },
          },
        ).catch(() => {
          logger('Copilot model selection failed, continuing with current model');
        });
      } else {
        logger('No desiredModel specified for Copilot, using current selection');
      }
    } else {
      // ChatGPT flow (existing logic)
      await navigateToChatGPT(Page, Runtime, config.url, logger);
      await ensureNotBlocked(Runtime, config.headless, logger);
      await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
      logger(`Prompt textarea ready (initial focus, ${promptText.length.toLocaleString()} chars queued)`);

      if (config.desiredModel) {
        await withRetries(
          () => ensureModelSelection(Runtime, config.desiredModel as string, logger),
          {
            retries: 2,
            delayMs: 300,
            onRetry: (attempt, error) => {
              if (options.verbose) {
                logger(`[retry] Model picker attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`);
              }
            },
          },
        );
        await ensurePromptReady(Runtime, config.inputTimeoutMs, logger);
        logger(`Prompt textarea ready (after model switch, ${promptText.length.toLocaleString()} chars queued)`);
      }
    }
    if (attachments.length > 0) {
      if (!DOM) {
        throw new Error('Chrome DOM domain unavailable while uploading attachments.');
      }
      for (const attachment of attachments) {
        logger(`Uploading attachment: ${attachment.displayPath}`);
        await uploadAttachmentFile({ runtime: Runtime, dom: DOM }, attachment, logger);
      }
      const waitBudget = Math.max(config.inputTimeoutMs ?? 30_000, 30_000);
      await waitForAttachmentCompletion(Runtime, waitBudget, logger);
      logger('All attachments uploaded');
    }
    await submitPrompt({ runtime: Runtime, input: Input }, promptText, logger);
    stopThinkingMonitor = startThinkingStatusMonitor(Runtime, logger, options.verbose ?? false);
    if (options.domSnapshotIntervalMs && options.domSnapshotIntervalMs > 0 && options.snapshotsDir) {
      stopSnapshotMonitor = startDomSnapshotMonitor(
        Runtime,
        options.domSnapshotIntervalMs,
        options.snapshotsDir,
        logger,
        snapshotPaths,
      );
    }
    // Platform-specific response waiting
    let answer;
    if (target === 'copilot') {
      answer = await waitForCopilotResponse(Runtime, config.timeoutMs, logger);
    } else {
      answer = await waitForAssistantResponse(Runtime, config.timeoutMs, logger);
    }

    answerText = answer.text;
    answerHtml = answer.html ?? '';

    let patchSource: string | null = null;
    let copiedMarkdown: string | null = null;
    if (target === 'copilot') {
      // Prefer clipboard-based extraction when available, then fall back to DOM snapshot text.
      patchSource = await extractCopilotClipboardPatch({ Runtime, Browser }, logger);
      if (!patchSource || patchSource.trim().length < 10) {
        logger('[browser] Clipboard extraction empty; falling back to DOM snapshot text.');
        patchSource = answerText || answerHtml || null;
      } else {
        logger('[browser] Using clipboard patch source for diff extraction.');
      }
      copiedMarkdown = patchSource ?? answerText ?? null;
    } else {
      copiedMarkdown = await withRetries(
        async () => {
          const attempt = await captureAssistantMarkdown(Runtime, answer.meta, logger);
          if (!attempt) {
            throw new Error('copy-missing');
          }
          return attempt;
        },
        {
          retries: 2,
          delayMs: 350,
          onRetry: (attempt, error) => {
            if (options.verbose) {
              logger(
                `[retry] Markdown capture attempt ${attempt + 1}: ${error instanceof Error ? error.message : error}`,
              );
            }
          },
        },
      ).catch(() => null);
    }
    answerMarkdown = copiedMarkdown ?? answerText;
    stopThinkingMonitor?.();
    stopSnapshotMonitor?.();
    runStatus = 'complete';
    const durationMs = Date.now() - startedAt;
    const answerChars = answerText.length;
    const answerTokens = estimateTokenCount(answerMarkdown);
    return {
      answerText,
      answerMarkdown,
      answerHtml: answerHtml.length > 0 ? answerHtml : undefined,
      patchSource: patchSource ?? undefined,
      tookMs: durationMs,
      answerTokens,
      answerChars,
      chromePid: chrome.pid,
      chromePort: chrome.port,
      userDataDir,
      snapshots: snapshotPaths.length > 0 ? snapshotPaths : undefined,
      platform: target, // Add platform info to help debugging
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    stopThinkingMonitor?.();
    stopSnapshotMonitor?.();
    const socketClosed = connectionClosedUnexpectedly || isWebSocketClosureError(normalizedError);
    connectionClosedUnexpectedly = connectionClosedUnexpectedly || socketClosed;
    if (!socketClosed) {
      logger(`Failed to complete ChatGPT run: ${normalizedError.message}`);
      if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && normalizedError.stack) {
        logger(normalizedError.stack);
      }
      throw normalizedError;
    }
    if ((config.debug || process.env.CHATGPT_DEVTOOLS_TRACE === '1') && normalizedError.stack) {
      logger(`Chrome window closed before completion: ${normalizedError.message}`);
      logger(normalizedError.stack);
    }
    throw new Error('Chrome window closed before Oracle finished. Please keep it open until completion.', {
      cause: normalizedError,
    });
  } finally {
    try {
      if (!connectionClosedUnexpectedly) {
        await client?.close();
      }
    } catch {
      // ignore
    }
    removeTerminationHooks?.();
    if (chrome && userDataDir) {
      if (!config.keepBrowser) {
        if (!connectionClosedUnexpectedly) {
          try {
            await chrome.kill();
          } catch {
            // ignore kill failures
          }
        }
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        if (!connectionClosedUnexpectedly) {
          const totalSeconds = (Date.now() - startedAt) / 1000;
          logger(`Cleanup ${runStatus} • ${totalSeconds.toFixed(1)}s total`);
        }
      } else if (!connectionClosedUnexpectedly) {
        logger(`Chrome left running on port ${chrome.port} with profile ${userDataDir}`);
      }
    }
  }
}

export { estimateTokenCount } from './utils.js';
export { resolveBrowserConfig, DEFAULT_BROWSER_CONFIG } from './config.js';
export { syncCookies } from './cookies.js';
export {
  navigateToChatGPT,
  ensureNotBlocked,
  ensurePromptReady,
  ensureModelSelection,
  submitPrompt,
  waitForAssistantResponse,
  captureAssistantMarkdown,
  uploadAttachmentFile,
  waitForAttachmentCompletion,
} from './pageActions.js';

// Copilot-specific exports for external use
export {
  detectTarget,
  navigateToCopilot,
  checkCopilotAuthentication,
  ensureCopilotPromptReady,
  waitForCopilotResponse,
} from './pageActions.js';

async function extractCopilotClipboardPatch(
  domains: { Runtime: ChromeClient['Runtime']; Browser?: ChromeClient['Browser'] },
  logger: BrowserLogger,
): Promise<string | null> {
  const { Runtime, Browser } = domains;

  // Try to grant clipboard permissions when Browser domain is available.
  if (Browser && typeof Browser.grantPermissions === 'function') {
    try {
      await Browser.grantPermissions({ permissions: ['clipboardRead', 'clipboardWrite'] });
    } catch {
      logger('[browser] Clipboard permission grant failed; continuing anyway.');
    }
  }

  try {
    const { result } = await Runtime.evaluate({
      expression: `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const seen = new Set();

        const thread = document.querySelector('[data-testid="chat-thread"], main[role="main"]');
        if (!thread) return { error: 'no_thread' };

        const messages = Array.from(
          thread.querySelectorAll('[data-testid="message-assistant"], [data-message-role="assistant"]'),
        );
        const lastMsg = messages.at(-1);
        if (!lastMsg) return { error: 'no_message' };

        const copyButtons = Array.from(
          lastMsg.querySelectorAll(
            'button[aria-label="Copy"], button[aria-label="Copy code"], button[class*="CopyButton"], button .octicon-copy',
          ),
        ).map((btn) => (btn.closest('button') ?? btn));

        if (!copyButtons.length) return { error: 'no_copy_buttons' };

        let combined = '';
        for (const btn of copyButtons) {
          try {
            btn.focus();
            btn.click();
            await wait(100);
            const text = await navigator.clipboard.readText();
            if (text && text.trim().length > 0) {
              const trimmed = text.trimEnd();
              if (!seen.has(trimmed)) {
                seen.add(trimmed);
                combined += trimmed + '\\n\\n';
              }
            }
          } catch (e) {
            return { error: 'clipboard_access_denied', details: String(e) };
          }
        }

        return combined.trim().length > 0 ? { success: true, text: combined.trimEnd() } : { error: 'empty' };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const value = result?.value as { success?: boolean; text?: string; error?: string } | undefined;
    if (value && value.success && value.text) {
      return value.text;
    }
    if (value?.error && value.error !== 'no_copy_buttons') {
      logger(`[browser] Clipboard extraction failed: ${value.error}`);
    }
  } catch {
    // Swallow clipboard extraction failures; caller will fall back.
  }

  return null;
}

function isWebSocketClosureError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('websocket connection closed') ||
    message.includes('websocket is closed') ||
    message.includes('websocket error') ||
    message.includes('target closed')
  );
}

export function formatThinkingLog(startedAt: number, now: number, message: string, locatorSuffix: string): string {
  const elapsedMs = now - startedAt;
  const elapsedText = formatElapsed(elapsedMs);
  const progress = Math.min(1, elapsedMs / 600_000); // soft target: 10 minutes
  const barSegments = 10;
  const filled = Math.round(progress * barSegments);
  const bar = `${'█'.repeat(filled).padEnd(barSegments, '░')}`;
  const pct = Math.round(progress * 100)
    .toString()
    .padStart(3, ' ');
  const statusLabel = message ? ` — ${message}` : '';
  return `[${elapsedText} / ~10m] ${bar} ${pct}%${statusLabel}${locatorSuffix}`;
}

function startThinkingStatusMonitor(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  includeDiagnostics = false,
): () => void {
  let stopped = false;
  let pending = false;
  let lastMessage: string | null = null;
  const startedAt = Date.now();
  const interval = setInterval(async () => {
    // biome-ignore lint/nursery/noUnnecessaryConditions: stop flag flips asynchronously
    if (stopped || pending) {
      return;
    }
    pending = true;
    try {
      const nextMessage = await readThinkingStatus(Runtime);
      if (nextMessage && nextMessage !== lastMessage) {
        lastMessage = nextMessage;
        let locatorSuffix = '';
        if (includeDiagnostics) {
          try {
            const snapshot = await readAssistantSnapshot(Runtime);
            locatorSuffix = ` | assistant-turn=${snapshot ? 'present' : 'missing'}`;
          } catch {
            locatorSuffix = ' | assistant-turn=error';
          }
        }
        logger(formatThinkingLog(startedAt, Date.now(), nextMessage, locatorSuffix));
      }
    } catch {
      // ignore DOM polling errors
    } finally {
      pending = false;
    }
  }, 1500);
  interval.unref?.();
  return () => {
    // biome-ignore lint/nursery/noUnnecessaryConditions: multiple callers may race to stop
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(interval);
  };
}

function startDomSnapshotMonitor(
  Runtime: ChromeClient['Runtime'],
  intervalMs: number,
  snapshotsDir: string,
  logger: BrowserLogger,
  snapshotPaths: string[],
): () => void {
  let stopped = false;
  let pending = false;
  let counter = 0;
  const maxSnapshots = 50;
  const ensureDir = async () => {
    try {
      await mkdir(snapshotsDir, { recursive: true });
    } catch {
      // ignore directory creation failures; snapshots will simply be skipped
    }
  };
  const interval = setInterval(async () => {
    if (stopped || pending || counter >= maxSnapshots) {
      return;
    }
    pending = true;
    try {
      await ensureDir();
      const snapshot = await readAssistantSnapshot(Runtime);
      if (snapshot && snapshot.length > 0) {
        counter += 1;
        const fileName = `snapshot-${String(counter).padStart(3, '0')}.html`;
        const filePath = `${snapshotsDir}/${fileName}`;
        await writeFile(filePath, snapshot, 'utf8');
        snapshotPaths.push(filePath);
        if (logger.verbose) {
          logger(`[browser] Saved DOM snapshot ${fileName}`);
        }
      }
    } catch {
      // ignore snapshot failures
    } finally {
      pending = false;
    }
  }, intervalMs);
  interval.unref?.();
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(interval);
  };
}

async function readThinkingStatus(Runtime: ChromeClient['Runtime']): Promise<string | null> {
  const expression = buildThinkingStatusExpression();
  try {
    const { result } = await Runtime.evaluate({ expression, returnByValue: true });
    const value = typeof result.value === 'string' ? result.value.trim() : '';
    const sanitized = sanitizeThinkingText(value);
    return sanitized || null;
  } catch {
    return null;
  }
}

function sanitizeThinkingText(raw: string): string {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  const prefixPattern = /^(pro thinking)\s*[•:\-–—]*\s*/i;
  if (prefixPattern.test(trimmed)) {
    return trimmed.replace(prefixPattern, '').trim();
  }
  return trimmed;
}

function buildThinkingStatusExpression(): string {
  const selectors = [
    'span.loading-shimmer',
    'span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary',
    '[data-testid*="thinking"]',
    '[data-testid*="reasoning"]',
    '[role="status"]',
    '[aria-live="polite"]',
  ];
  const keywords = ['pro thinking', 'thinking', 'reasoning', 'clarifying', 'planning', 'drafting', 'summarizing'];
  const selectorLiteral = JSON.stringify(selectors);
  const keywordsLiteral = JSON.stringify(keywords);
  return `(() => {
    const selectors = ${selectorLiteral};
    const keywords = ${keywordsLiteral};
    const nodes = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => nodes.add(node));
    }
    document.querySelectorAll('[data-testid]').forEach((node) => nodes.add(node));
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const text = node.textContent?.trim();
      if (!text) {
        continue;
      }
      const classLabel = (node.className || '').toLowerCase();
      const dataLabel = ((node.getAttribute('data-testid') || '') + ' ' + (node.getAttribute('aria-label') || ''))
        .toLowerCase();
      const normalizedText = text.toLowerCase();
      const matches = keywords.some((keyword) =>
        normalizedText.includes(keyword) || classLabel.includes(keyword) || dataLabel.includes(keyword)
      );
      if (matches) {
        const shimmerChild = node.querySelector(
          'span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary',
        );
        if (shimmerChild?.textContent?.trim()) {
          return shimmerChild.textContent.trim();
        }
        return text.trim();
      }
    }
    return null;
  })()`;
}
