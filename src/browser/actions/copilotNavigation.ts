/**
 * GitHub Copilot-specific navigation and interaction functions
 */

import type { ChromeClient, BrowserLogger } from '../types.js';
import { delay } from '../utils.js';

/**
 * Navigate to GitHub Copilot and ensure we're on the right page
 */
export async function navigateToCopilot(
  Page: ChromeClient['Page'],
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
) {
  logger('Navigating to GitHub Copilot...');

  await Page.navigate({ url: 'https://github.com/copilot/' });

  // Wait for page load and authentication check
  await Page.loadEventFired();
  await delay(2000); // Extra delay for Copilot interface initialization

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
 * Wait for Copilot response completed (with better selectors)
 */
export async function waitForCopilotResponse(
  Runtime: ChromeClient['Runtime'],
  timeoutMs: number,
  logger: BrowserLogger
): Promise<{ text: string; html: string | null }> {
  logger('Waiting for Copilot response...');
  const started = Date.now();

  // Try different selectors for Copilot responses
  const responseSelectors = [
    '[data-qa*="copilot-answer"]',
    '[data-testid*="copilot-response"]',
    '.copilot-answer',
    '.copilot-response',
    '[data-skip-answer="true"]' // possible internal property
  ];

  let lastContent = '';
  let sameContentCount = 0;
  const requiredStabilization = 3;

  while (Date.now() - started < timeoutMs) {
    const result = await Runtime.evaluate({
      expression: `(() => {
        // Prefer the Copilot markdown container when available; it holds the
        // assistant's rendered markdown without sidebar chrome.
        const markdownRoot = document.querySelector('div.markdown-body.MarkdownRenderer-module__container--dNKcF[data-copilot-markdown="true"]') ||
          document.querySelector('div.markdown-body[data-copilot-markdown="true"]');

        const scope = markdownRoot || document;
        const candidateEls = scope.querySelectorAll('${responseSelectors.join(', ')}');
        let text = '';
        let html = '';

        if (candidateEls.length > 0) {
          // Use the first matching element
          const el = candidateEls[0];
          text = el.innerText || el.textContent || '';
          html = el.innerHTML;
        } else {
          // Fallback: try markdown from last div containing code blocks (likely GitHub markdown)
          const lastDiv = scope.querySelector('div .markdown-recirculation:last-of-type, div[class*="markdown"]:not(:empty):last-of-type');
          if (lastDiv) {
            text = lastDiv.innerText || lastDiv.textContent || '';
            html = lastDiv.innerHTML;
          }
        }

        const isTyping = scope.querySelector('.animate-something, .pulse, [data-working="true"]') !== null;

        return {
          text: text.trim(),
          html: html,
          chars: text.trim().length,
          isTyping: isTyping
        };
      })()`,
      returnByValue: true
    });

    const res = result.result.value;

    if (!res.isTyping && res.chars > 0) {
      // Stabilization check
      if (!lastContent || res.text !== lastContent) {
        lastContent = res.text;
        sameContentCount = 0;
      } else {
        sameContentCount++;
      }

      if (sameContentCount >= requiredStabilization) {
        logger('Copilot response complete ✓');
        return {
          text: res.text,
          html: res.html
        };
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  logger('Copilot response timeout');
  return {
    text: '',
    html: null
  };
}
