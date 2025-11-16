/**
 * Copilot-specific integration for Oracle browser mode
 * Extends the existing browser infrastructure for GitHub Copilot support
 */

import type { ChromeClient, BrowserLogger } from './types.js';

/**
 * Integrate Copilot-specific logic into the existing browser flow
 */
export function integrateCopilotLogic(
  url: string,
  Runtime: ChromeClient['Runtime'],
  Page: ChromeClient['Page'],
  Input: ChromeClient['Input'],
  DOM: ChromeClient['DOM'] | null,
  logger: BrowserLogger,
  isCopilot: boolean
) {
  if (!isCopilot) {
    return null; // No Copilot logic needed
  }

  return {
    // Navigation logic
    async navigate() {
      logger('Navigating to GitHub Copilot...');
      await Page.navigate({ url: 'https://github.com/copilot/' });
      await Page.loadEventFired();
      // Extra delay for Copilot initialization
      await new Promise(resolve => setTimeout(resolve, 2000));
    },

    // Authentication check
    async checkAuth() {
      const authCheck = await Runtime.evaluate({
        expression: `(() => {
          // Check if we're on the Copilot chat interface vs marketing page
          const isMarketingPage = document.querySelector('[href*="signup"], [href*="login"], [class*="marketing"]') !== null;
          const hasChatInterface = document.querySelector('textarea[data-qa*="copilot"], input[data-testid*="copilot"], [class*="copilot-input"]') !== null;
          const pageTitle = document.title.toLowerCase();

          return {
            authenticated: !isMarketingPage && hasChatInterface,
            pageTitle: document.title,
            location: window.location.href,
            hasMarketing: isMarketingPage,
            hasChat: hasChatInterface
          };
        })()`,
        returnByValue: true
      });

      const result = authCheck.result.value;

      if (!result || result.authenticated === false) {
        logger('⚠️  GitHub Copilot not properly authenticated');
        logger(`Page: ${result.pageTitle} (${result.location})`);
        logger('Please authenticate manually if in headful mode');
        return false;
      }

      logger('GitHub Copilot authentication checked ✓');
      return true;
    },

    // Input readiness
    async ensureInputReady() {
      logger('Ensuring Copilot input is ready...');

      const inputSelectors = [
        'textarea[data-qa*="copilot"]',
        'textarea[placeholder*="Ask Copilot"]',
        'input[data-testid*="copilot"]',
        ' textarea[name="question"]',
        '[class*="copilot-input"]',
        'textarea[class*="copilot"]'
      ];

      let inputSelector = null;

      for (const selector of inputSelectors) {
        const found = await Runtime.evaluate({
          expression: `document.querySelector('${selector}') ? '${selector}' : null`,
          returnByValue: true
        });

        if (found.result.value) {
      inputSelector = found.result.value;
          break;
        }
      }

      if (!inputSelector) {
     logger('Could not find Copilot input field');
return null;
      }

      // Check if input is interactive
      const isInteractive = await Runtime.evaluate({
        expression: `(() => {
          const el = document.querySelector('${inputSelector}');
          if (!el) return null;

          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const isEnabled = !el.disabled && !el.readOnly;

    return {
            found: true,
      visible: isVisible,
            enabled: isEnabled,
            selector: '${inputSelector}'
          };
        })()`,
        returnByValue: true
      });

      const res = isInteractive.result.value;
      if (res && res.found && res.visible && res.enabled) {
     logger(`Copilot input ready: ${res.selector} ✓`);
      return inputSelector;
  }

      logger('Copilot input not ready');
      return null;
    },

    // Wait for response (placeholder - will adapt selectors based on testing)
    async waitForResponse(timeoutMs: number, logger: BrowserLogger) {
      logger('Waiting for Copilot response...');
  const started = Date.now();

      const responseSelectors = [
        ' [data-qa*="copilot-response"]',
        ' [data-testid*="copilot-answer"]',
    ' [class*="copilot-answer"]',
  ' [class*="copilot-response"]',
        '.markdown' // Generic fallback
      ];

      let lastContent = '';
      let sameContentCount = 0;
      const requiredStabilization = 3;

while (Date.now() - started < timeoutMs) {
      const result = await Runtime.evaluate({
     expression: `(() => {
      const selectors = '${responseSelectors.join(', ')}';
  let text = '';
   let html = '';
  let found = false;

          for (const selector of selectors.split(', ')) {
  const el = document.querySelector(selector);
            if (el) {
              text = el.innerText || el.textContent || '';
              html = el.innerHTML;
       found = true;
    break;
            }
          }

        // Check if still "typing"
          const isTyping = document.querySelector('[data-working="true"], .animate-spin, [class*="loading"]') !== null;

          return {
         found: found,
     text: text.trim(),
           html: html,
          isTyping: isTyping
          };
        })()`,
        returnByValue: true
      });

        const res = result.result.value;

      if (!res.found) {
        await new Promise(resolve => setTimeout(resolve, 1000));
     continue;
      }

      if (!res.isTyping && res.text.length > 0) {
        // Stabilization check
        if (lastContent !== res.text) {
          lastContent = res.text;
        sameContentCount = 0;
        } else {
        sameContentCount++;
    }

        if (sameContentCount >= requiredStabilization) {
       logger('Copilot response complete ✓');
          return {
            text: res.text,
            html: res.html,
          meta: { source: 'copilot', selector: 'copilot-detector'} // Metadata for compatibility
          };
  }
  }

   await new Promise(resolve => setTimeout(resolve, 1000));
 }

      logger('Copilot response timeout');
      return {
text: '',
        html: null,
        meta: { source: 'copilot', timeout: true }
      };
    }
  };