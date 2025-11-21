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

  // Unified helper to ensure all successful exits emit both required log lines.
  const finalizeReturn = (
    textOut: string,
    htmlOut: string | null,
    reason: string,
    stabilized: boolean = true,
  ) => {
    if (stabilized) {
      logger(`Copilot snapshot stabilized${reason ? ` (${reason})` : ''}`);
    }
    logger(`Copilot response complete ✓${reason ? ` (${reason})` : ''}`);
    return { text: textOut, html: htmlOut };
  };

  const snapshotExpr = `(() => {
    // Robust snapshot logic: prioritize assistant patch blocks, avoid brittle class hashes.

    // --- CONFIG ---
    const SEL = {
      scope: [
        '[data-testid="chat-thread"]',
        '[data-conversation]',
        'main[role="main"]',
        '.chat-input-wrapper',
        '[class*="ConversationView-module__container"]'
      ],
      message: [
        '[data-testid="message-assistant"]',
        '[data-message-role="assistant"]',
        'div[class*="ChatMessage-module__chatMessage"][class*="ai"]',
        'div[class*="assistant"]'
      ],
      markdown: [
        '[data-component="Markdown"]',
        '[class*="markdown-body"]',
        '.markdown-body',
        '[data-copilot-markdown]'
      ],
      codeContainer: [
        '[class*="CodeBlock-module__container"]',
        'div[class*="CodeBlock"]',
        'pre',
        'figure'
      ],
      stopIcon: [
        'button[aria-label="Stop generating"]',
        '.octicon-stop',
        'svg[class*="octicon-stop"]'
      ],
      sendIcon: [
        'button[aria-label="Send now"]',
        '.octicon-paper-airplane',
        'svg[class*="octicon-paper-airplane"]',
        '[data-testid="send-button"]'
      ],
      loadingIndicator: [
        '[data-loading="true"]',
        '.animate-spin'
      ]
    };

    function extractText(root) {
      if (!root) return '';
      const clone = root.cloneNode(true);
      const trash = clone.querySelectorAll(
        'button, [role="button"], .sr-only, [aria-label="Copy"]',
      );
      trash.forEach((el) => el.remove());
      return (clone.innerText || '').trim();
    }

    const debug = {
      scopeFound: false,
      latestFound: false,
      candidateMarkdownBodies: 0,
      firstCandidatePreview: '',
      chosenPreview: '',
    };

    // 1. Conversation scope
    let scope: Element | null = null;
    for (const s of SEL.scope) {
      scope = document.querySelector(s);
      if (scope) {
        debug.scopeFound = true;
        break;
      }
    }

    // 2. Latest assistant message
    let latestMsg: Element | null = null;
    if (scope) {
      let candidates: Element[] = [];
      for (const s of SEL.message) {
        const found = Array.from(scope.querySelectorAll(s));
        if (found.length) {
          candidates = candidates.concat(found);
        }
      }
      if (candidates.length) {
        latestMsg = candidates[candidates.length - 1]!;
        debug.latestFound = true;
      }
    }

    // 3. Extract content, prioritizing patch blocks
    let finalText = '';
    let finalHtml = '';

    if (latestMsg) {
      const codeContainers = Array.from(
        latestMsg.querySelectorAll(SEL.codeContainer.join(',')),
      );
      const patchBlock = codeContainers.find((el) =>
        (el.innerText || '').includes('*** Begin Patch'),
      );

      if (patchBlock) {
        finalText = extractText(patchBlock);
        finalHtml = patchBlock.innerHTML;
      } else {
        const md =
          latestMsg.querySelector(SEL.markdown.join(',')) || latestMsg;
        if (md) {
          finalText = extractText(md);
          finalHtml = (md as HTMLElement).innerHTML || '';
        }
      }
    }

    // 4. Debug-only global scan
    if (!finalText) {
      const globalMd = document.querySelectorAll(SEL.markdown.join(','));
      debug.candidateMarkdownBodies = globalMd.length;
      if (globalMd.length > 0) {
        const last = globalMd[globalMd.length - 1]!;
        debug.firstCandidatePreview = (last.innerText || '').substring(0, 120);
      }
    }

    debug.chosenPreview = finalText.substring(0, 120);

    // 5. Completion / typing detection
    let isTyping = true;
    let loadingAttr: string | null = null;

    const stopBtn = document.querySelector(SEL.stopIcon.join(','));
    const sendBtn = document.querySelector(SEL.sendIcon.join(','));
    const spinner = document.querySelector(SEL.loadingIndicator.join(','));

    const toolbar = sendBtn ? sendBtn.closest('[class*="ChatInput-module__toolbar"]') : null;
    if (toolbar) {
      loadingAttr = toolbar.getAttribute('data-loading');
    }

    const hasStopIcon = !!stopBtn;
    const hasAirplane =
      !!sendBtn && (sendBtn as HTMLElement).getBoundingClientRect().width > 0;
    const isSpinnerActive = !!spinner;

    if (hasAirplane && !isSpinnerActive) {
      isTyping = false;
    } else if (hasStopIcon || isSpinnerActive) {
      isTyping = true;
    }

    return {
      text: finalText,
      html: finalHtml,
      isTyping,
      chars: finalText.length,
      hasMarkdown: finalText.length > 0,
      hasAirplane,
      hasStopIcon,
      loadingAttr,
      scopeFound: debug.scopeFound,
      latestFound: debug.latestFound,
      globalMarkdownFound: debug.candidateMarkdownBodies > 0,
      debugCandidates: debug.candidateMarkdownBodies,
      debugPreview: debug.firstCandidatePreview,
      debugChosen: debug.chosenPreview,
    };
  })()`;

  let firstLongAnswerAt: number | null = null;

  while (Date.now() - started < timeoutMs) {
    const snapResult = await Runtime.evaluate({ expression: snapshotExpr, returnByValue: true });
    const snap = snapResult.result?.value || {};
    const debugSnap = snap as any;
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
      logger(
        `[hang-debug] scopeFound=${debugSnap.scopeFound}, latestFound=${debugSnap.latestFound}, candidates=${debugSnap.debugCandidates}`,
      );
      logger(
        `[hang-debug] preview="${String(debugSnap.debugPreview ?? '').substring(
          0,
          200,
        )}", chosen="${String(debugSnap.debugChosen ?? '').substring(0, 200)}"`,
      );
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
      return finalizeReturn(confirmText, html, 'early patch-detected');
    }

    // Another early exit for UI completion with substantial content, skip stability checks
    if ((uiDone || sendIconVisible) && hasMarkdown && chars > 100 && !containsNav && chars < 2000) {
      logger(
        `[content-ready] Early exit: UI done with ${chars} chars (${chars < 800 ? 'short' : 'medium'} answer)`,
      );
      return finalizeReturn(confirmText, html, 'content-ready');
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
      return finalizeReturn(text, html, 'send-icon-visible');
    }

    if (!isTyping && (uiDone || sendIconVisible) && hasMarkdown && confirmText.length > 0) {
      const enoughStableCycles =
        chars >= minCharsForLongAnswer
          ? stableCycles >= longAnswerStableCycles
          : stableCycles >= requiredStableCycles;

      // If UI shows "done" and we have non-empty markdown, exit immediately.
      if (chars >= minCharsForEarlyExit) {
        return finalizeReturn(confirmText, html, 'ui-done-immediate');
      }

      // UI reports done + non-empty markdown: bail out immediately to avoid hangs.
      if (stableCycles === 0 && elapsed > 2_000) {
        return finalizeReturn(confirmText, html, 'ui-done-immediate');
      }

      // Heuristic: if the text contains explicit patch markers, accept sooner.
      if (patchMarkersPresent && (stableCycles >= 1 || elapsed > earlyUiDoneFallbackMs)) {
        return finalizeReturn(confirmText, html, 'early patch heuristic (markers)');
      }

      // Standard stability path.
      if (enoughStableCycles) {
        return finalizeReturn(confirmText, html, 'standard stability');
      }

      // Inactivity fallback: UI done + no changes for a while.
      if (elapsed - lastChangeAt > earlyUiDoneFallbackMs / 2 && chars > 100) {
        return finalizeReturn(confirmText, html, 'inactivity fallback');
      }

      // Safety valve: if UI says done and we have non-empty markdown,
      // do not wait indefinitely for perfect stability.
      if (elapsed > 15_000 && chars > minCharsForEarlyExit) {
        return finalizeReturn(confirmText, html, 'late ui-done safety');
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
      return finalizeReturn(confirmText, html, 'soft-complete long-answer', true);
    }

    if (seenNewText && elapsed >= fallbackAfterMs && elapsed - lastChangeAt >= fallbackAfterMs / 3 && lastSnapshot.text) {
      logger('Copilot response fallback: using latest assistant markdown after stability timeout', {
        elapsedMs: elapsed,
        chars: lastSnapshot.chars,
      });
      return finalizeReturn(lastSnapshot.text, lastSnapshot.html, 'stability timeout fallback');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  logger('Copilot response timeout');
  // Fail closed: do not return sidebar chrome as a "response".
  return { text: '', html: null };
}
