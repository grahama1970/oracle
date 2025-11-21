/**
 * GitHub Copilot-specific navigation and interaction functions
 */

import type { ChromeClient, BrowserLogger } from '../types.js';
import { delay } from '../utils.js';
import {
  COPILOT_MARKDOWN_SELECTORS,
  COPILOT_MESSAGE_SELECTORS,
  COPILOT_MARKDOWN_BODY_SELECTOR,
  COPILOT_LOADING_BUTTON_SELECTOR,
  COPILOT_CONVERSATION_SCOPE_SELECTOR,
  COPILOT_STOP_ICON_SELECTOR,
  COPILOT_SEND_ICON_SELECTOR,
} from '../constants.js';

const COPILOT_CHAT_URL = 'https://github.com/copilot?tab=chat';

/**
 * Navigate to GitHub Copilot and ensure we're on the right page
 */
export async function navigateToCopilot(
  Page: ChromeClient['Page'],
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
) {
  logger('Navigating to GitHub Copilot...');

  await Page.navigate({ url: COPILOT_CHAT_URL });

  // Wait for page load and authentication check
  await Page.loadEventFired();
  await delay(2000); // Extra delay for Copilot interface initialization

  await dismissCopilotAnnouncementModal(Runtime, logger);
  await ensureCopilotChatTab(Runtime, logger);

  // Check if we're on the right page and authenticated
  const isAuthenticated = await checkCopilotAuthentication(Runtime, logger);

  if (!isAuthenticated) {
    logger('⚠️  Not properly authenticated to GitHub Copilot');
    logger('Please ensure you have authenticated to GitHub first');
  }
}

/**
 * Check if user is authenticated to GitHub Copilot
 */
export async function checkCopilotAuthentication(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
): Promise<boolean> {
  // Check for Copilot chat interface vs marketing page
  const authCheck = await Runtime.evaluate({
    expression: `(() => {
      // Look for Copilot chat interface elements. GitHub frequently tweaks
      // the DOM, so use a broader selector set that also covers
      // contenteditable chat composers.
      const chatSelectors = [
        '#copilot-chat-textarea',
        'textarea[data-qa*="copilot"]',
        'textarea[placeholder*="Ask Copilot"]',
        'textarea[placeholder*="Ask anything"]',
        'textarea[aria-label*="Ask anything"]',
        'textarea[name="question"]',
        'input[data-testid*="copilot"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-qa*="copilot"]',
        'div[contenteditable="true"][aria-label*="Copilot"]'
      ];
      const hasChatInput = chatSelectors.some(sel => document.querySelector(sel));
      const hasMarketingPrompt = document.querySelector('[href*="signup"], [href*="login"]') !== null;
      const pageTitle = document.title.toLowerCase();
      const currentUrl = window.location.href;

      // Check if we're on Copilot vs marketing page
      const likelyAuthenticated =
        !hasMarketingPrompt &&
        currentUrl.includes('/copilot') &&
        pageTitle.includes('copilot');

      return {
        authenticated: likelyAuthenticated,
        pageTitle: document.title,
        hasChatInput: hasChatInput,
        hasMarketing: hasMarketingPrompt
      };
    })()`,
    returnByValue: true
  });

  const result = authCheck.result.value || {};

  if (!result.authenticated) {
    logger('GitHub Copilot Status: Marketing page detected');
    logger(`Page title: ${result.pageTitle}`);
    return false;
  }

  logger('GitHub Copilot Status: Authenticated ✓');
  return true;
}

/**
 * Ensure Copilot input is ready for prompts
 */
export async function ensureCopilotPromptReady(
  Runtime: ChromeClient['Runtime'],
  inputTimeoutMs: number,
  logger: BrowserLogger
): Promise<string | null> {
  logger('Ensuring Copilot chat input is ready...');

  const selectors = [
    '#copilot-chat-textarea',
    'textarea[data-qa*="copilot"]',
    'textarea[placeholder*="Ask Copilot"]',
    'textarea[placeholder*="Ask anything"]',
    'textarea[aria-label*="Ask anything"]',
    'input[data-testid*="copilot"]',
    'textarea[name="question"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-qa*="copilot"]',
    'div[contenteditable="true"][aria-label*="Copilot"]'
  ];

  let inputElementPath = null;

  // Try selectors in order until we find one
  for (const selector of selectors) {
    const found = await Runtime.evaluate({
      expression: `document.querySelector('${selector}') ? '${selector}' : null`,
      returnByValue: true
    });

    if (found.result.value) {
      inputElementPath = found.result.value;
      break;
    }
  }

  if (!inputElementPath) {
    logger('Could not find Copilot input field');
    return null;
  }

  // Ensure input is visible and interactive
  const isInteractive = await Runtime.evaluate({
    expression: `(() => {
      const el = document.querySelector('${inputElementPath}');
      if (!el) return { found: false };

      const rect = el.getBoundingClientRect();
      return {
        found: true,
        visible: rect.width > 0 && rect.height > 0,
        disabled: el.disabled || el.readOnly,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`,
    returnByValue: true
  });

  const res = isInteractive.result.value;
  if (res.found && res.visible && !res.disabled) {
    logger(`Copilot input ready: ${inputElementPath}`);
    return inputElementPath;
  }

  logger('Copilot input field not ready');
  return null;
}

async function dismissCopilotAnnouncementModal(Runtime: ChromeClient['Runtime'], logger: BrowserLogger): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const modal = document.querySelector('[data-testid="product-announcement-modal"]');
        if (!modal) return false;
        const close = modal.querySelector('button[aria-label="Close modal"], button[aria-label="Close"], button.octicon-x');
        if (close) {
          close.click();
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    if (result?.value) {
      logger('Closed Copilot announcement modal');
      break;
    }
    await delay(250);
  }
}

async function ensureCopilotChatTab(Runtime: ChromeClient['Runtime'], logger: BrowserLogger): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const url = window.location.href;
        const hasChat = !!document.querySelector('#copilot-chat-textarea, [data-testid="chat-thread"]');
        if (url.includes('/copilot?tab=chat') || hasChat) {
          return { ready: true };
        }
        const tab = document.querySelector('a[href="/copilot?tab=chat"], a[href="https://github.com/copilot?tab=chat"], button[data-component="SegmentedControlButton"][value="chat"], button[aria-label*="Chat"][data-selected]');
        if (tab) {
          tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return { switched: true };
        }
        return { switched: false };
      })()`,
      returnByValue: true,
    });
    const value = (result?.value ?? {}) as { ready?: boolean; switched?: boolean };
    if (value.ready) {
      return;
    }
    if (value.switched) {
      logger('Switching Copilot into chat tab…');
      await delay(600);
      continue;
    }
    await delay(300);
  }
  logger('Warning: Could not confirm Copilot chat tab; continuing anyway');
}

/**
 * Wait for Copilot response ready (not typing/fetching)
 */
export async function waitForCopilotReady(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
): Promise<boolean> {
  logger('Waiting for Copilot to be ready to respond...');

  const ready = await Runtime.evaluate({
    expression: `(() => {
      // More ChatGPT-focused; adapt
      const loadingSpinner = document.querySelector('[data-analytics-label="loading"], .progressive-disclosure-copartial, [aria-label*="loading"]');
      const spinnerText =
        document.querySelector(
          '[class*="loading"], [data-state="loading"], .animate-spin'
        );
      const inputLocked = document.querySelector('textarea[disabled]');
      return {
        loadingSpinner: !!loadingSpinner,
        spinnerText: !!spinnerText,
        inputLocked: !!inputLocked,
        ready: !loadingSpinner && !spinnerText && !inputLocked
      };
    })()`,
    returnByValue: true
  });

  const res = ready.result.value;

  if (res.ready) {
    logger('Copilot is ready to receive prompts ✓');
    return true;
  }

  logger('Copilot still busy - waiting...');
  return false;
}

/**
 * Wait for Copilot response completed using robust signals + inactivity fallback.
 */
export async function waitForCopilotResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
): Promise<{ text: string; html: string | null }> {
  logger('Waiting for Copilot response...');
  const started = Date.now();
  const pollIntervalMs = 1000;

  const MIN_CHARS_FOR_VALID_RESPONSE = 20;
  const INACTIVITY_THRESHOLD_MS = 6000;
  const HARD_TIMEOUT_MS = timeoutMs;

  let lastText = '';
  let lastChangeTime = Date.now();

  while (Date.now() - started < HARD_TIMEOUT_MS) {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const scope =
          document.querySelector('${COPILOT_CONVERSATION_SCOPE_SELECTOR}') ||
          document.querySelector('[data-testid="chat-thread"], main[role="main"]');
        if (!scope) return { status: 'no-scope', chars: 0 };

        const allMsgs = Array.from(
          scope.querySelectorAll('.markdown-body, [data-message-role="assistant"]'),
        );
        const latestMsg = allMsgs.length ? allMsgs[allMsgs.length - 1] : null;

        let text = '';
        let html = '';
        if (latestMsg) {
          const clone = latestMsg.cloneNode(true);
          clone.querySelectorAll('button, .sr-only').forEach((el) => el.remove());
          text = (clone.innerText || '').trim();
          html = (latestMsg as HTMLElement).innerHTML;
        }

        const sel = {
          stop: [
            'button[aria-label="Stop generating"]',
            '.octicon-stop',
            '[data-testid="stop-button"]',
          ],
          send: [
            'button[aria-label="Send now"]',
            '.octicon-paper-airplane',
            '[data-testid="send-button"]',
            'button[type="submit"]:not([disabled])',
          ],
          spinner: ['[data-loading="true"]', '.animate-spin', 'svg[class*="anim-rotate"]'],
        };

        const find = (arr: string[]) => arr.some((s) => !!document.querySelector(s));

        const hasStop = find(sel.stop);
        const hasSpinner = find(sel.spinner);
        const hasSend = find(sel.send);

        const isBusy = hasStop || hasSpinner;

        return {
          status: 'ok',
          text,
          html,
          isBusy,
          hasSend,
          hasStop,
          hasSpinner,
          chars: text.length,
        };
      })()`,
      returnByValue: true,
    });

    const state = result.value || {};
    const now = Date.now();

    if (state.status === 'ok') {
      if (state.text !== lastText) {
        lastChangeTime = now;
        lastText = state.text;
      }
      const timeSinceLastChange = now - lastChangeTime;

      if ((now - started) % 3000 < 1000) {
        logger(
          `[poll] chars=${state.text.length}, busy=${state.isBusy} (stop=${state.hasStop}, spin=${state.hasSpinner}), sendVisible=${state.hasSend}, stable=${(
            timeSinceLastChange / 1000
          ).toFixed(1)}s`,
        );
      }

      if (state.hasSend && !state.isBusy) {
        if (timeSinceLastChange > 1000 && state.text.length > MIN_CHARS_FOR_VALID_RESPONSE) {
          logger('Copilot response complete (UI Signal: Send Icon).');
          return { text: state.text, html: state.html };
        }
      }

      if (
        !state.isBusy &&
        state.text.length > MIN_CHARS_FOR_VALID_RESPONSE &&
        timeSinceLastChange > INACTIVITY_THRESHOLD_MS
      ) {
        logger(
          `Copilot response complete (Inactivity Fallback: stable for ${INACTIVITY_THRESHOLD_MS}ms).`,
        );
        return { text: state.text, html: state.html };
      }
    }

    await delay(pollIntervalMs);
  }

  logger('Copilot response timed out.');
  return { text: lastText, html: null };
}
