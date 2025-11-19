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
  const softCompleteAfterMs = 45_000;
  const fallbackAfterMs = 30_000;
  const minCharsForLongAnswer = 800;
  const longAnswerStableCycles = 1;
  const earlyUiDoneFallbackMs = 8_000;
  const minCharsForEarlyExit = 400;
  let stableCycles = 0;
  let lastText = '';
  let baselineText = '';
  let seenNewText = false;
  let lastChangeAt = started;
  let lastSnapshot: { text: string; html: string; isTyping: boolean; chars: number } = {
    text: '',
    html: '',
    isTyping: true,
    chars: 0,
  };

  const snapshotExpr = `(() => {
    // NEW SNAPSHOT LOGIC: Always return the last non-empty markdown body

    // 1) Try scoped selection first (original logic)
    let scopedText = '';
    let scopedHtml = '';
    let scopeFound = false;
    let latestFound = false;

    // Original scoped snapshot attempt remains as first choice
    const scopeSelectors = [
      '[data-testid="chat-thread"]',
      'div[data-conversation]',
      '.chat-input-wrapper',
      'div[data-testid="chat-input-wrapper"]',
      'div[data-copilot-chat-input]',
      'div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_'
    ];

    let scope = null;
    for (const sel of scopeSelectors) {
      scope = document.querySelector(sel);
      if (scope) {
        scopeFound = true;
        break;
      }
    }

    let latestMsg = null;
    if (scope) {
      const assistantSelectors = [
        'div.message-container[class*="ChatMessage"][class*="ai" i]',
        'div[class*="assistant" i]',
        '[data-copilot-message="assistant"]',
        '[data-message-role="assistant"]'
      ];

      for (const sel of assistantSelectors) {
        const found = Array.from(scope.querySelectorAll(sel));
        if (found.length) {
          latestMsg = found.at(-1);
          latestFound = true;
          break;
        }
      }

      if (latestMsg) {
        const md = latestMsg.querySelector('div.markdown-body[data-copilot-markdown], div.markdown-body, .markdown');
        if (md && md.innerText?.trim()) {
          const cleaned = md.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi, '').trim();
          scopedText = cleaned.length > 0 ? cleaned : md.innerText;
          scopedHtml = md.innerHTML || '';
        }
      }
    }

    // 2) Fallback: Get the last non-empty markdown body on the page
    let globalMarkdown = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown');
    let globalMarkdownFound = false;
    let globalSource = 'none';
    let finalText = scopedText;
    let finalHtml = scopedHtml;

    if (scopedText.length === 0) {
      const visibleMarkdowArray = Array.from(globalMarkdown).filter(el => (el.innerText || '').trim().length > 0);

      if (visibleMarkdowArray.length > 0) {
        const lastMd = visibleMarkdowArray.at(-1);
        const cleaned = lastMd.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi, '').trim();
        finalText = cleaned.length > 0 ? cleaned : lastMd.innerText.trim();
        finalHtml = lastMd.innerHTML || '';
        globalMarkdownFound = true;
        globalSource = 'fallback';
        console.log(
          '[Snapshot Fallback Used]',
          'scopedLength:', scopedText.length,
          'fallbackLength:', finalText.length,
          'chosenSource:', globalSource
        );
      }
    }

    // 3) Determine typing status
    let isTyping = true;
    let hasAirplane = false;
    let hasStopIcon = false;
    let loadingAttr = null;

    const toolbarButton = document.querySelector('div.ChatInput-module__toolbarButtons--YDoIY > button') ||
                          document.querySelector('[data-component="IconButton"][data-loading]') ||
                          document.querySelector('[data-loading]');

    if (toolbarButton) {
      loadingAttr = toolbarButton.getAttribute('data-loading');
      const svg = toolbarButton.querySelector('svg');

      if (svg) {
        const svgClass = svg.getAttribute('class') || '';
        const svgAria = svg.getAttribute('aria-label') || '';

        hasStopIcon = svgClass.includes('octicon-square-fill') || /stop/i.test(svgAria);
        hasAirplane = svgClass.includes('octicon-paper-airplane') || /paper.?airplane/i.test(svgAria) ||
                      document.querySelector('svg.octicon-paper-airplane') !== null;
      }
    }

    // Typing rules simplified per your spec
    if (hasAirplane) {
      // Send icon visible means Copilot is done accepting input, even if
      // data-loading still reports "true" due to slow toolbar updates.
      isTyping = false;
    } else if (hasStopIcon || (loadingAttr && loadingAttr !== 'false')) {
      isTyping = true;
    }

    // Return snapshot with flags
    return {
      text: finalText,
      html: finalHtml,
      isTyping: isTyping,
      chars: finalText.length || 0,
      hasMarkdown: finalText.length > 0,
      scopeFound: scopeFound,
      latestFound: latestFound,
      globalMarkdownFound: globalMarkdownFound,
      hasAirplane: hasAirplane,
      hasStopIcon: hasStopIcon,
      loadingAttr: loadingAttr,
      containsNav: /Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/i.test(finalText)
    };
  })()`;

  let firstLongAnswerAt: number | null = null;

  while (Date.now() - started < timeoutMs) {
    const snapResult = await Runtime.evaluate({ expression: snapshotExpr, returnByValue: true });
    const snap = snapResult.result?.value || {};
    const text: string = typeof snap.text === 'string' ? snap.text : '';
    const html: string = typeof snap.html === 'string' ? snap.html : '';
    let isTyping: boolean = Boolean(snap.isTyping);
    const chars: number = Number.isFinite((snap as any).chars) ? Number((snap as any).chars) : text.length;
    const containsNav: boolean = Boolean((snap as any).containsNav);
    const hasMarkdown: boolean = Boolean((snap as any).hasMarkdown);
    const hasAirplane: boolean = Boolean((snap as any).hasAirplane);
    const loadingAttr: string | null = typeof (snap as any).loadingAttr === 'string' ? (snap as any).loadingAttr : null;
    const hasStopIcon: boolean = Boolean((snap as any).hasStopIcon);
    const scopeFound: boolean = Boolean((snap as any).scopeFound);
    const latestFound: boolean = Boolean((snap as any).latestFound);
    const globalMarkdownFound: boolean = Boolean((snap as any).globalMarkdownFound);

    const loadingActive = Boolean(loadingAttr && loadingAttr !== 'false');
    const sendIconVisible = hasAirplane;
    const uiDone = sendIconVisible && !loadingActive;
    const navRegex = /Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/i;
    const looksLikeChrome = navRegex.test(text) || text.length > 5000;

    const elapsed = Date.now() - started;

    // Debug logging per your spec: elapsed, chars, flags, isTyping, uiDone
    if (elapsed % 5000 < pollIntervalMs || lastText !== text) {
      logger(`[poll] elapsed=${elapsed}ms, chars=${chars}, scopeFound=${scopeFound}, latestFound=${latestFound}, globalMarkdownFound=${globalMarkdownFound}, isTyping=${isTyping}, uiDone=${uiDone}`);
    }

    // Enhanced logging for issues when chars=0
    if (chars === 0) {
      // Compare what scoped vs global found when hang detected
      const getScopedHtml = text;
      const getGlobalHtml = await Runtime.evaluate({
        expression: `(() => {
          const globalMarkdown = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown');
          const visibleMd = Array.from(globalMarkdown).filter(el => (el.innerText || '').trim().length > 0);
          if (visibleMd.length > 0) {
            const last = visibleMd.at(-1);
            return (last.innerText || '').trim().substring(0, 200);
          }
          return '';
        })()`,
        returnByValue: true
      }).then(r => r.result?.value || '');

      logger(`[debug zero-chars] Potential hang - scoped vs global comparison:`);
      logger(`[debug zero-chars] - scoped (first 200): "${String(getScopedHtml).substring(0, 200)}"`);
      logger(`[debug zero-chars] - global (first 200): "${String(getGlobalHtml).substring(0, 200)}"`);
    }

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

    const patchMarkersPresent = /(\*\*\*\s*Begin Patch|diff --git|@@ -\d+,\d+ \+\d+,\d+ @@|```diff|```patch|\*\*\*\s*Update File)/i.test(
      confirmText,
    );

    // Early exit if we detect patch markers and have reasonable content
    if (patchMarkersPresent && chars > 50 && !isTyping) {
      logger(`[patch-detected] Early exit: Patch markers found (${chars} chars, isTyping=${isTyping})`);
      return { text: confirmText, html };
    }

    // Another early exit for UI completion with substantial content, skip stability checks
    if ((uiDone || sendIconVisible) && hasMarkdown && chars > 100 && !containsNav && chars < 2000) {
      logger(`[content-ready] Early exit: UI done with ${chars} chars (${chars < 800 ? 'short' : 'medium'} answer)`);
      return { text: confirmText, html };
    }

    if (confirmText.length > 800 && !firstLongAnswerAt) {
      firstLongAnswerAt = Date.now();
      logger(`waitForCopilotResponse: observed long Copilot answer (~${confirmText.length} chars)`);
    }

    // Track meaningful changes to the assistant response.
    if (text && text !== baselineText) {
      baselineText = text;
      seenNewText = true;
      stableCycles = 0;
      lastChangeAt = Date.now();
      lastSnapshot = { text, html, isTyping, chars };
    } else if (seenNewText) {
      stableCycles += 1;
    }

    // NEW EARLY EXIT: Send icon shown with non-empty markdown - return immediately
    if (sendIconVisible && text.length > 0) {
      logger(
        `[immediate-exit] Send icon shown with ${text.length} chars (loadingAttr=${loadingAttr ?? 'null'}) - returning`,
      );
      return { text: text, html: html };
    }

    if (!isTyping && (uiDone || sendIconVisible) && hasMarkdown && confirmText.length > 0) {
      const enoughStableCycles =
        chars >= minCharsForLongAnswer
          ? stableCycles >= longAnswerStableCycles
          : stableCycles >= requiredStableCycles;

      // If UI shows "done" and we have non-empty markdown, exit immediately.
      if (chars >= minCharsForEarlyExit) {
        logger('Copilot response complete ✓ (UI done immediate)');
        return { text: confirmText, html };
      }

      // UI reports done + non-empty markdown: bail out immediately to avoid hangs.
      if (stableCycles === 0 && elapsed > 2_000) {
        logger('Copilot response complete ✓ (UI done immediate)');
        return { text: confirmText, html };
      }

      // Heuristic: if the text contains explicit patch markers, accept sooner.
      if (patchMarkersPresent && (stableCycles >= 1 || elapsed > earlyUiDoneFallbackMs)) {
        logger('Copilot snapshot stabilized (patch markers)');
        logger('Copilot response complete ✓ (early patch heuristic)');
        return { text: confirmText, html };
      }

      // Standard stability path.
      if (enoughStableCycles) {
        logger('Copilot snapshot stabilized');
        logger('Copilot response complete ✓');
        return { text: confirmText, html };
      }

      // Inactivity fallback: UI done + no changes for a while.
      if (elapsed - lastChangeAt > earlyUiDoneFallbackMs / 2 && chars > 100) {
        logger('Copilot snapshot stabilized (inactivity)');
        logger('Copilot response complete ✓ (inactivity fallback)');
        return { text: confirmText, html };
      }

      // Safety valve: if UI says done and we have non-empty markdown,
      // do not wait indefinitely for perfect stability.
      if (elapsed > 15_000 && chars > minCharsForEarlyExit) {
        logger('Copilot response complete ✓ (early exit after UI done)');
        return { text: confirmText, html };
      }
    } else {
      stableCycles = 0;
      lastText = confirmText || lastText;
    }

    if (
      firstLongAnswerAt &&
      elapsed - firstLongAnswerAt >= softCompleteAfterMs &&
      confirmText &&
      !navRegex.test(confirmText)
    ) {
      logger(
        `Copilot response fallback: using latest assistant markdown after ${Math.round(
          (elapsed - firstLongAnswerAt) / 1000,
        )}s without strict stability`,
      );
      logger('Copilot response complete ✓');
      return { text: confirmText, html };
    }

    if (seenNewText && elapsed >= fallbackAfterMs && elapsed - lastChangeAt >= fallbackAfterMs / 3 && lastSnapshot.text) {
      logger(
        'Copilot response fallback: using latest assistant markdown after stability timeout',
        { elapsedMs: elapsed, chars: lastSnapshot.chars },
      );
      logger('Copilot response complete ✓ (fallback)');
      return { text: lastSnapshot.text, html: lastSnapshot.html };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  logger('Copilot response timeout');
  // Fail closed: do not return sidebar chrome as a "response".
  return { text: '', html: null };
}
