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
  COPILOT_SPINNER_SELECTOR,
  COPILOT_ASSISTANT_CONTAINER_SELECTOR,
  STOP_BUTTON_SELECTOR,
  SEND_BUTTON_SELECTOR,
  MODEL_BUTTON_SELECTOR,
} from '../constants.js';

const COPILOT_CHAT_URL = 'https://github.com/copilot?tab=chat';

/**
 * Completion detection signals for tracking Copilot response state
 */
interface CompletionSignals {
  stopButtonGone: boolean;
  sendButtonEnabled: boolean;
  spinnerGone: boolean;
  markdownStable: boolean;
  cyclesStable: number;
}

/**
 * Options for waitForCopilotResponse function
 */
interface WaitForResponseOptions {
  timeout?: number;
  stabilityCheckInterval?: number;
  requiredStableCycles?: number;
}

/**
 * Result from waitForCopilotResponse function
 */
interface WaitForResponseResult {
  completed: boolean;
  completionPath: string;
  signals: CompletionSignals;
  elapsed: number;
  text: string;
  html: string | null;
}

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
 * Read the currently selected Copilot model label from the UI.
 * Returns null when the chip/button cannot be found.
 */
export async function readCopilotModelLabel(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
): Promise<string | null> {
  try {
    const { result } = await Runtime.evaluate({
      expression: `(() => {
        const selectors = [
          '${MODEL_BUTTON_SELECTOR}',
          '[data-testid*="model-switcher"]',
          'button[aria-label*="Model"]',
          'button:has(svg.octicon-sparkle)',
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.textContent) {
            return btn.textContent.trim();
          }
        }
        return null;
      })()`,
      returnByValue: true,
    });
    const value = typeof result.value === 'string' ? result.value.trim() : null;
    if (value) {
      logger(`Copilot model chip reports: ${value}`);
    } else {
      logger('Copilot model chip not found');
    }
    return value;
  } catch (error) {
    logger(`Failed to read Copilot model label: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extract the latest Copilot response from the page with improved content cleaning.
 * Tries clipboard copy first, falls back to DOM extraction with sidebar filtering.
 */
export async function extractCopilotResponse(
  Runtime: ChromeClient['Runtime'],
  options: { selectorMetrics?: boolean } = {}
): Promise<{ text: string; html: string | null; metrics?: any }> {
  const metrics = {
    copyButtonFound: false,
    clipboardSuccess: false,
    fallbackUsed: false,
    messagesFound: 0,
    sidebarContentRemoved: 0,
    assistantContainerFound: false,
  };

  // Try clipboard copy first (preferred method)
  try {
    // Find the last assistant message copy button
    const { result: copyCheck } = await Runtime.evaluate({
      expression: `(() => {
        const copyButtons = document.querySelectorAll('button[aria-label*="copy"], button[data-component*="copy"], .copy-button');
        return copyButtons.length > 0;
      })()`,
      returnByValue: true
    });

    if (copyCheck.value) {
      metrics.copyButtonFound = true;
      // Click to copy
      await Runtime.evaluate({
        expression: `(() => {
          const copyButtons = document.querySelectorAll('button[aria-label*="copy"], button[data-component*="copy"], .copy-button');
          if (copyButtons.length > 0) {
            copyButtons[copyButtons.length - 1].click();
            return true;
          }
          return false;
        })()`,
        returnByValue: true
      });

      await delay(300);

      // Get clipboard content
      const { result: clipboardResult } = await Runtime.evaluate({
        expression: `navigator.clipboard.readText()`,
        returnByValue: true
      });

      const clipboardText = clipboardResult.value || '';
      if (clipboardText && clipboardText.trim().length > 0) {
        metrics.clipboardSuccess = true;
        const cleaned = clipboardText.trim();
        logger('Extracted response via clipboard copy');
        if (options.selectorMetrics) {
          logger('Extraction metrics:', metrics);
        }
        return { text: cleaned, html: cleaned, metrics };
      }
    }
  } catch (error) {
    logger.warn('Clipboard extraction failed, falling back to DOM:', error);
  }

  // Fallback to DOM extraction with improved filtering
  metrics.fallbackUsed = true;
  logger('Using DOM extraction fallback with sidebar filtering');

  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const scopes = [
        '${COPILOT_CONVERSATION_SCOPE_SELECTOR}',
        '${COPILOT_ASSISTANT_CONTAINER_SELECTOR}',
        '[data-testid="chat-thread"]',
        'main[role="main"]'
      ];

      let container = null;
      for (const selector of scopes) {
        const found = document.querySelector(selector);
        if (found) {
          container = found;
          break;
        }
      }

      if (!container) return { error: 'no-container' };

      const allMsgs = Array.from(
        container.querySelectorAll('.markdown-body, [data-message-role="assistant"]')
      );
      const messagesFound = allMsgs.length;

      const latestMsg = allMsgs.length ? allMsgs[allMsgs.length - 1] : null;
      if (!latestMsg) return { error: 'no-messages' };

      // Clone to avoid mutating live DOM
      const clone = latestMsg.cloneNode(true) as HTMLElement;

      // Remove known sidebar/nav/tool elements
      const removeSelectors = [
        '[role="navigation"]',
        '.copilot-sidebar',
        '.copilot-toolbar',
        '[data-testid="copilot-sidebar"]',
        '.ActionList',
        '[aria-label*="sidebar"]',
        'header',
        'nav',
        '.navigation',
        '.menu',
        '.sidebar'
      ];

      let removeCount = 0;
      removeSelectors.forEach((sel) => {
        const elements = clone.querySelectorAll(sel);
        elements.forEach((node) => {
          node.remove();
          removeCount++;
        });
      });

      // Extract text from markdown body
      const markdownBody = clone.querySelector('[data-testid="markdown-body"], .markdown-body');
      const textContent = markdownBody ? markdownBody.textContent || '' : clone.textContent || '';

      const htmlContent = (latestMsg as HTMLElement).innerHTML;

      return {
        text: textContent.trim(),
        html: htmlContent,
        messagesFound,
        sidebarContentRemoved: removeCount,
        assistantContainerFound: !!document.querySelector('${COPILOT_ASSISTANT_CONTAINER_SELECTOR}')
      };
    })()`,
    returnByValue: true
  });

  const resultValue = result.value;

  if (resultValue.error) {
    const errorMsg = resultValue.error === 'no-container'
      ? 'No assistant container found'
      : 'No messages found';
    logger.warn(`DOM extraction failed: ${errorMsg}`);
    if (options.selectorMetrics) {
      logger('Extraction metrics:', metrics);
    }
    return { text: '', html: null, metrics };
  }

  metrics.messagesFound = resultValue.messagesFound;
  metrics.sidebarContentRemoved = resultValue.sidebarContentRemoved;
  metrics.assistantContainerFound = resultValue.assistantContainerFound;

  const cleaned = resultValue.text.trim();
  logger('Extracted response via DOM fallback', {
    length: cleaned.length,
    extractedFrom: 'assistant container',
    sidebarItemsRemoved: metrics.sidebarContentRemoved
  });

  if (options.selectorMetrics) {
    logger('Extraction metrics:', metrics);
  }

  return { text: cleaned, html: resultValue.html, metrics };
}

/**
 * - Stop button disappears
 * - Send button re-enabled
 * - Spinner disappears
 * - Markdown content stable (no changes for N cycles)
 * - MutationObserver detects final assistant message update
 *
 * Returns early if all signals indicate completion, or after timeout with partial status.
 */
export async function waitForCopilotResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger,
  options: WaitForResponseOptions = {}
): Promise<WaitForResponseResult> {
  const {
    stabilityCheckInterval = 500,
    requiredStableCycles = 3,
  } = options;

  const start = Date.now();

  let lastMarkdownContent = '';
  let stableCycles = 0;
  let mutationDetected = false;
  let observerDisconnected = false;

  const signals: CompletionSignals = {
    stopButtonGone: false,
    sendButtonEnabled: false,
    spinnerGone: false,
    markdownStable: false,
    cyclesStable: 0,
  };

  logger('Waiting for Copilot response to complete...');

  // Set up MutationObserver to watch the assistant message container
  const observerSetup = await Runtime.evaluate({
    expression: `(() => {
      const containerSelector = '${COPILOT_ASSISTANT_CONTAINER_SELECTOR}';
      const container = document.querySelector(containerSelector);
      if (!container) {
        return { success: false };
      }

      let lastUpdate = Date.now();
      const observer = new MutationObserver(() => {
        lastUpdate = Date.now();
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Store observer reference for cleanup
      (window as any).__copilotObserver = observer;
      (window as any).__copilotLastUpdate = () => lastUpdate;
      return { success: true, hasObserver: true };
    })()`,
    returnByValue: true
  });

  const observerCreated = observerSetup.result.value?.success === true;

  let lastText = '';
  let lastHtml: string | null = null;
  let firstValidContent = false;

  try {
    while (Date.now() - start < timeoutMs) {
      const elapsed = Date.now() - start;

      const { result } = await Runtime.evaluate({
        expression: `(() => {
          const scope =
            document.querySelector('${COPILOT_CONVERSATION_SCOPE_SELECTOR}') ||
            document.querySelector('${COPILOT_ASSISTANT_CONTAINER_SELECTOR}') ||
            document.querySelector('[data-testid="chat-thread"], main[role="main"]');
          if (!scope) return { status: 'no-scope', signals: {} };

          const allMsgs = Array.from(
            scope.querySelectorAll('.markdown-body, [data-message-role="assistant"]'),
          );
          const latestMsg = allMsgs.length ? allMsgs[allMsgs.length - 1] : null;

          let text = '';
          let html = '';
          if (latestMsg) {
            // Clone to avoid mutating live DOM
            const clone = latestMsg.cloneNode(true) as HTMLElement;
            // Remove buttons and screen reader content
            clone.querySelectorAll('button, .sr-only, .copilot-sidebar, [role="navigation"], nav, header').forEach((el) => el.remove());
            text = (clone.innerText || '').trim();
            html = (latestMsg as HTMLElement).innerHTML;
          }

          // Check completion signals
          const sel = {
            stop: [
              'button[aria-label="Stop generating"]',
              '.octicon-stop',
              '${STOP_BUTTON_SELECTOR}',
            ],
            send: [
              'button[aria-label="Send now"]',
              '.octicon-paper-airplane',
              '${SEND_BUTTON_SELECTOR}',
            ],
            spinner: ['[data-loading="true"]', '.animate-spin', 'svg[class*="anim-rotate"]', '${COPILOT_SPINNER_SELECTOR}'],
          };

          const find = (arr: string[]) => arr.some((s) => !!document.querySelector(s));

          const hasStop = find(sel.stop);
          const hasSpinner = find(sel.spinner);
          const hasSend = find(sel.send);

          const scopeCheck = scope.cloneNode(true) as HTMLElement;
          scopeCheck.querySelectorAll('[role="navigation"], .copilot-sidebar, nav, header').forEach((el) => el.remove());
          const clearText = (scopeCheck.innerText || '').trim();

          // Check send button state
          let sendButtonEnabled = false;
          const sendButton = document.querySelector(sel.send.join(', '));
          if (sendButton) {
            const button = sendButton as HTMLButtonElement;
            if (button.disabled !== undefined) {
              sendButtonEnabled = !button.disabled;
            } else {
              // Check for disabled class or attribute
              sendButtonEnabled = !button.classList.contains('disabled') && !button.hasAttribute('disabled');
            }
          }

          return {
            status: 'ok',
            text,
            html,
            signals: {
              stopButtonGone: !hasStop,
              sendButtonEnabled,
              spinnerGone: !hasSpinner,
              markdownStable: false,
              cyclesStable: 0,
            },
            hasContent: text.length > 0,
            clearOfSidebarBleed: clearText.includes(text) // Ensure text comes from assistant container
          };
        })()`,
        returnByValue: true,
      });

      const state = result.value || {};
      const now = Date.now();

      if (state.status === 'ok') {
        // Update basic signals
        signals.stopButtonGone = state.signals.stopButtonGone;
        signals.sendButtonEnabled = state.signals.sendButtonEnabled;
        signals.spinnerGone = state.signals.spinnerGone;

        // Check markdown stability
        if (state.text !== lastMarkdownContent && state.text.length > 0) {
          stableCycles = 0;
          lastMarkdownContent = state.text;
          lastText = state.text;
          lastHtml = state.html;
        } else if (state.text.length > 0) {
          stableCycles++;
        }

        signals.cyclesStable = stableCycles;
        signals.markdownStable = stableCycles >= requiredStableCycles;

        // Check mutation observer
        if (observerCreated) {
          const { result: mutationResult } = await Runtime.evaluate({
            expression: `(() => {
              const getLastUpdate = (window as any).__copilotLastUpdate;
              const now = Date.now();
              return getLastUpdate ? now - getLastUpdate() : 0;
            })()`,
            returnByValue: true
          });
          const timeSinceLastMutation = mutationResult.value || 0;
          mutationDetected = timeSinceLastMutation > stabilityCheckInterval * requiredStableCycles;
        }

        // Log progress every 5 seconds
        if (Math.floor(elapsed / 5000) > Math.floor((elapsed - stabilityCheckInterval) / 5000)) {
          logger(
            `[progress] ${(elapsed / 1000).toFixed(1)}s | stop=${signals.stopButtonGone} send=${signals.sendButtonEnabled} spin=${signals.spinnerGone} stable=${stableCycles}/${requiredStableCycles} chars=${state.text.length}`
          );
        }

        // Check if all signals indicate completion
        if (
          signals.stopButtonGone &&
          signals.sendButtonEnabled &&
          signals.spinnerGone &&
          signals.markdownStable &&
          state.hasContent
        ) {
          logger('Copilot response complete (all signals green)');
          return {
            completed: true,
            completionPath: 'all_signals',
            signals,
            text: lastText,
            html: lastHtml,
            elapsed: now - start
          };
        }

        // Partial completion check (if we have content and it's stable but some UI signals aren't ready)
        if (signals.markdownStable && state.hasContent && (elapsed > Math.min(timeoutMs, 30000) || firstValidContent)) {
          const completionPath = !signals.stopButtonGone && signals.sendButtonEnabled ? 'ui_inconsistent' : 'partial_completion';
          logger(`Copilot response partial completion detected (${completionPath})`);
          return {
            completed: true,
            completionPath,
            signals,
            text: lastText,
            html: lastHtml,
            elapsed: now - start
          };
        }

        firstValidContent = firstValidContent || (state.hasContent && state.clearOfSidebarBleed);
      }

      await delay(stabilityCheckInterval);
    }

    // Timeout reached - return partial
    logger('Timeout waiting for Copilot response - returning partial');
    return {
      completed: false,
      completionPath: 'forced_timeout',
      signals,
      text: lastText,
      html: lastHtml,
      elapsed: Date.now() - start
    };

  } finally {
    // Clean up observer
    if (observerCreated && !observerDisconnected) {
      await Runtime.evaluate({
        expression: `(() => {
          const observer = (window as any).__copilotObserver;
          if (observer) observer.disconnect();
          delete (window as any).__copilotObserver;
          delete (window as any).__copilotLastUpdate;
        })()`,
        returnByValue: true
      }).catch(() => {});
      observerDisconnected = true;
    }
  }
}
