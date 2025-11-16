#!/usr/bin/env tsx

/**
 * Minimal proof‑of‑concept script:
 * - Launches the existing Oracle browser engine
 * - Navigates to https://github.com/copilot/
 * - Sends a simple prompt
 * - Logs the raw response text/markdown
 *
 * This does NOT yet use Copilot‑specific selectors; it is a starting point
 * to iterate on DOM behavior for Copilot Web.
 */

import { runBrowserMode, type BrowserAutomationConfig } from '../src/browserMode.js';

async function main() {
  const [, , ...args] = process.argv;
  const prompt = args.join(' ').trim() || 'Hello from the Oracle Copilot POC. Please respond with a short acknowledgement.';

  const config: BrowserAutomationConfig = {
    chromeProfile: null,
    chromePath: null,
    // Point at Copilot Web instead of ChatGPT
    url: 'https://github.com/copilot/',
    timeoutMs: 900_000,
    inputTimeoutMs: 30_000,
    cookieSync: true,
    headless: false,
    keepBrowser: false,
    hideWindow: false,
    desiredModel: null,
    debug: true,
    allowCookieErrors: true,
  };

  // Simple logger that mirrors what the main CLI does
  const log = (message?: string) => {
    if (typeof message === 'string') {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  };

  try {
    log(`Starting Copilot POC run with prompt (${prompt.length} chars)...`);
    const result = await runBrowserMode({
      prompt,
      attachments: [],
      config,
      log,
      heartbeatIntervalMs: 30_000,
      verbose: true,
    });
    log('--- Copilot POC Result ---');
    log(`Answer text length: ${result.answerText.length}`);
    log(`Answer markdown length: ${result.answerMarkdown.length}`);
    log('');
    log('Answer (markdown or text):');
    log(result.answerMarkdown || result.answerText || '(no answer text)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('Copilot POC failed:', message);
    process.exitCode = 1;
  }
}

void main();

