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

  // We mirror the ChatGPT "wait until stable" behavior: poll a small snapshot
  // (isTyping + markdown text) and only capture once it stabilizes.
  // Keep polling snappy, but require a couple of stable cycles.
  const pollIntervalMs = 400;
  const requiredStableCycles = 2;
  let stableCycles = 0;
  let lastText = '';
  let baselineText: string | null = null;
  let seenNewText = false;

  const markdownSelectorList = COPILOT_MARKDOWN_SELECTORS.join(', ');
  const snapshotExpr = `(() => {
    // 1) STRICT SCOPE: Only look inside the conversation container. Never fall back to document.
    const scope = document.querySelector('${COPILOT_CONVERSATION_SCOPE_SELECTOR}');
    if (!scope) {
      return { text: '', html: '', isTyping: true, chars: 0 };
    }

    // 2) LATEST ASSISTANT TURN: Only consider the last assistant message inside scope.
    const selectors = ${JSON.stringify(COPILOT_MESSAGE_SELECTORS)};
    let latestMsg = null;
    for (const sel of selectors) {
      const found = Array.from(scope.querySelectorAll(sel));
      if (found.length) {
        latestMsg = found[found.length - 1];
        break;
      }
    }
    if (!latestMsg || !scope.contains(latestMsg)) {
      return { text: '', html: '', isTyping: true, chars: 0 };
    }

    // 3) MARKDOWN BODY: Only accept the explicit Copilot markdown body within that message.
    const markdownRoot = latestMsg.querySelector('${COPILOT_MARKDOWN_BODY_SELECTOR}');

    // If we can't find a markdown body, keep waiting.
    if (!markdownRoot) {
      return { text: '', html: '', isTyping: true, chars: 0, hasMarkdown: false };
    }

    // Extract ONLY the markdown body content.
    const rawText = (markdownRoot.innerText || '').trim();
    const html = markdownRoot.innerHTML || '';

    // 4) NAV/CHROME GUARD: If the text contains obvious sidebar/navigation strings or is huge,
    // force waiting to avoid capturing sidebar/history chrome.
    const containsNav = /Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/ i.test(rawText);
    const tooLarge = rawText.length > 5000;

    // Typing/done detection (Copilot-specific): read the toolbar button state.
    const toolbarButton =
      document.querySelector('div.ConversationView-module__footer--xr6HB form div.ChatInput-module__toolbarButtons--YDoIY > button') ||
      document.querySelector('${COPILOT_LOADING_BUTTON_SELECTOR}');

    const loadingAttr = toolbarButton?.getAttribute('data-loading');
    const svg = toolbarButton?.querySelector('svg');
    const svgClass = svg?.getAttribute('class') || '';
    const svgAria = svg?.getAttribute('aria-label') || '';

    const hasAirplane =
      svgClass.includes('octicon-paper-airplane') || /paper.?airplane/i.test(svgAria) ||
      Boolean(document.querySelector('${COPILOT_SEND_ICON_SELECTOR}'));
    const hasStopIcon =
      svgClass.includes('octicon-square-fill') || /stop/i.test(svgAria) ||
      Boolean(document.querySelector('${COPILOT_STOP_ICON_SELECTOR}'));

    // 5) PROGRESS/DONE RULES:
    // - In progress iff data-loading truthy OR stop icon present.
    // - Done iff airplane icon present AND data-loading falsy.
    // - If neither icon found, keep waiting (treat as typing).
    let isTyping = true;
    if ((loadingAttr && loadingAttr !== 'false') || hasStopIcon) {
      isTyping = true;
    } else if (hasAirplane && (!loadingAttr || loadingAttr === 'false')) {
      isTyping = false;
    } else {
      isTyping = true;
    }

    // If the snapshot looks like chrome or is excessively large, force waiting.
    const text = (containsNav || tooLarge) ? '' : rawText;
    if (containsNav || tooLarge) {
      isTyping = true;
    }

    return {
      text,
      html: (containsNav || tooLarge) ? '' : html,
      isTyping,
      chars: text.length,
      hasMarkdown: true,
      hasAirplane,
      loadingAttr,
      hasStopIcon,
    };
  })()`;

  while (Date.now() - started < timeoutMs) {
    const snapResult = await Runtime.evaluate({ expression: snapshotExpr, returnByValue: true });
    const snap = snapResult.result?.value || {};
    const text: string = typeof snap.text === 'string' ? snap.text : '';
    const html: string = typeof snap.html === 'string' ? snap.html : '';
    const isTyping: boolean = Boolean(snap.isTyping);
    const hasMarkdown: boolean = Boolean((snap as any).hasMarkdown);
    const hasAirplane: boolean = Boolean((snap as any).hasAirplane);
    const loadingAttr: string | null = typeof (snap as any).loadingAttr === 'string' ? (snap as any).loadingAttr : null;

    // Record the first observed text as the baseline so we don't capture
    // pre-existing sidebar or stale assistant content. Only consider
    // completion after we detect text that differs from this baseline.
    if (baselineText === null) {
      baselineText = text;
    }

    if (!seenNewText && hasMarkdown && text && baselineText !== null && text.length > baselineText.length) {
      seenNewText = true;
    }

    const uiDone = hasAirplane && (!loadingAttr || loadingAttr === 'false');
    const navRegex = /Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/i;
    const looksLikeChrome = navRegex.test(text) || text.length > 5000;

    // Double-check by re-reading markdown once UI says done.
    let confirmText = text;
    if (!looksLikeChrome && uiDone && hasMarkdown) {
      const confirm = await Runtime.evaluate({
        expression: `(() => {
          const scope = document.querySelector('${COPILOT_CONVERSATION_SCOPE_SELECTOR}');
          if (!scope) return '';
          const selectors = ${JSON.stringify(COPILOT_MESSAGE_SELECTORS)};
          let latest = null;
          for (const sel of selectors) {
            const found = Array.from(scope.querySelectorAll(sel));
            if (found.length) { latest = found.at(-1); break; }
          }
          if (!latest || !scope.contains(latest)) return '';
          const md = latest.querySelector('${COPILOT_MARKDOWN_BODY_SELECTOR}');
          if (!md) return '';
          return (md.innerText || '').trim();
        })()`,
        returnByValue: true,
      });
      confirmText = typeof confirm.result?.value === 'string' ? (confirm.result.value as string) : '';
      if (navRegex.test(confirmText) || confirmText.length === 0) {
        // Treat as still typing to avoid capturing chrome.
        isTyping = true;
      }
    }

    if (!isTyping && uiDone && hasMarkdown && confirmText.length > 0 && seenNewText && !navRegex.test(confirmText)) {
      if (text === lastText) {
        stableCycles += 1;
      } else {
        lastText = text;
        stableCycles = 0;
      }
      if (stableCycles >= requiredStableCycles) {
        logger('Copilot snapshot stabilized');
        logger('Copilot response complete ✓');
        return { text, html };
      }
    } else {
      stableCycles = 0;
      lastText = text || lastText;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  logger('Copilot response timeout');
  // Fail closed: do not return sidebar chrome as a "response".
  return { text: '', html: null };
}
