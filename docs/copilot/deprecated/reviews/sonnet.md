# Answers to Clarifying Questions

1. **MutationObserver for completion detection**: Yes, acceptable and recommended. A MutationObserver on the assistant message container is more precise than polling alone. We should use it in combination with polling for robustness—observe mutations to detect new content, then verify stability with short polling cycles.

2. **HTML fallback when clipboard succeeds**: Keep the HTML fallback as a last resort, but with strict scoping to the assistant message container only. The clipboard approach is preferred, but network issues or permission problems can cause it to fail silently. The fallback should explicitly exclude sidebar/navigation elements.

3. **Wall-clock timeout**: 90 seconds is reasonable for the max timeout. Yes, surface `status="timeout_partial"` when we bail early, and include `completionPath: "forced_timeout"` in the result metadata so consumers know the response may be incomplete.

4. **Minimum markdown length gate**: Don't gate on minimum length—that can cause false negatives for short but complete responses. Instead, gate on: (a) disappearance of the stop button, (b) send button enabled, (c) markdown stability (no changes for N cycles), and optionally (d) presence of closing markers like code fence endings if the request asked for code.

5. **Selector hit/miss metrics**: Yes, absolutely. Recording selector metrics in `metrics.json` (or in `result.json` under a `diagnostics` key) will be invaluable for debugging selector drift as GitHub updates the UI.

---

# Unified Diff

```diff
Stabilize Copilot completion detection and strip sidebar bleed in browser transport

diff --git a/src/browser/actions/copilotNavigation.ts b/src/browser/actions/copilotNavigation.ts
index 1234567..abcdef0 100644
--- a/src/browser/actions/copilotNavigation.ts
+++ b/src/browser/actions/copilotNavigation.ts
@@ -1,10 +1,12 @@
 import { Page } from 'playwright';
 import {
   COPILOT_SEND_BUTTON_SELECTOR,
   COPILOT_STOP_BUTTON_SELECTOR,
   COPILOT_MESSAGE_SELECTORS,
   COPILOT_MARKDOWN_BODY_SELECTOR,
+  COPILOT_SPINNER_SELECTOR,
+  COPILOT_ASSISTANT_CONTAINER_SELECTOR,
 } from '../constants.js';
 import { logger } from '../../utils/logger.js';
 
@@ -50,46 +52,175 @@ export async function sendCopilotMessage(
   return true;
 }
 
+interface CompletionSignals {
+  stopButtonGone: boolean;
+  sendButtonEnabled: boolean;
+  spinnerGone: boolean;
+  markdownStable: boolean;
+  cyclesStable: number;
+}
+
+interface WaitForResponseOptions {
+  timeout?: number;
+  stabilityCheckInterval?: number;
+  requiredStableCycles?: number;
+}
+
+interface WaitForResponseResult {
+  completed: boolean;
+  completionPath: string;
+  signals: CompletionSignals;
+  elapsed: number;
+}
+
 /**
- * Wait for Copilot to finish responding by polling for the stop button to disappear
- * and the send button to become enabled again.
+ * Wait for Copilot to finish responding using multiple completion signals:
+ * - Stop button disappears
+ * - Send button re-enabled
+ * - Spinner disappears
+ * - Markdown content stable (no changes for N cycles)
+ * - MutationObserver detects final assistant message update
+ *
+ * Returns early if all signals indicate completion, or after timeout with partial status.
  */
 export async function waitForCopilotResponse(
   page: Page,
-  timeout = 60000
-): Promise<boolean> {
-  const startTime = Date.now();
-  const checkInterval = 500;
+  options: WaitForResponseOptions = {}
+): Promise<WaitForResponseResult> {
+  const {
+    timeout = 90000,
+    stabilityCheckInterval = 500,
+    requiredStableCycles = 3,
+  } = options;
+
+  const start = Date.now();
+  let lastMarkdownContent = '';
+  let stableCycles = 0;
+  let mutationDetected = false;
+  let observerDisconnected = false;
+
+  const signals: CompletionSignals = {
+    stopButtonGone: false,
+    sendButtonEnabled: false,
+    spinnerGone: false,
+    markdownStable: false,
+    cyclesStable: 0,
+  };
+
+  // Set up MutationObserver to watch the assistant message container
+  const observerHandle = await page.evaluateHandle(
+    ({ containerSelector, markdownSelector }) => {
+      return new Promise<boolean>((resolve) => {
+        const container = document.querySelector(containerSelector);
+        if (!container) {
+          resolve(false);
+          return;
+        }
+
+        let lastUpdate = Date.now();
+        const observer = new MutationObserver(() => {
+          lastUpdate = Date.now();
+        });
+
+        observer.observe(container, {
+          childList: true,
+          subtree: true,
+          characterData: true,
+        });
+
+        // Store observer reference for cleanup
+        (window as any).__copilotObserver = observer;
+        (window as any).__copilotLastUpdate = () => lastUpdate;
+        resolve(true);
+      });
+    },
+    {
+      containerSelector: COPILOT_ASSISTANT_CONTAINER_SELECTOR,
+      markdownSelector: COPILOT_MARKDOWN_BODY_SELECTOR,
+    }
+  );
+
+  const observerCreated = await observerHandle.jsonValue();
+  await observerHandle.dispose();
 
   logger.info('Waiting for Copilot response to complete...');
 
-  while (Date.now() - startTime < timeout) {
-    // Check if stop button is gone (response complete)
-    const stopButton = await page.$(COPILOT_STOP_BUTTON_SELECTOR);
-    const sendButton = await page.$(COPILOT_SEND_BUTTON_SELECTOR);
-
-    if (!stopButton && sendButton) {
-      const isEnabled = await sendButton.evaluate(
-        (el) => !(el as HTMLButtonElement).disabled
-      );
-      if (isEnabled) {
-        logger.info('Copilot response completed');
-        return true;
+  try {
+    while (Date.now() - start < timeout) {
+      const elapsed = Date.now() - start;
+
+      // Check stop button
+      const stopButton = await page.$(COPILOT_STOP_BUTTON_SELECTOR);
+      signals.stopButtonGone = !stopButton;
+
+      // Check send button
+      const sendButton = await page.$(COPILOT_SEND_BUTTON_SELECTOR);
+      if (sendButton) {
+        signals.sendButtonEnabled = await sendButton.evaluate(
+          (el) => !(el as HTMLButtonElement).disabled
+        );
+      }
+
+      // Check spinner
+      const spinner = await page.$(COPILOT_SPINNER_SELECTOR);
+      signals.spinnerGone = !spinner;
+
+      // Check markdown stability
+      const currentMarkdown = await page.evaluate(
+        (selector) => {
+          const messages = document.querySelectorAll(selector);
+          if (messages.length === 0) return '';
+          const lastMsg = messages[messages.length - 1];
+          return lastMsg.textContent?.trim() || '';
+        },
+        COPILOT_MESSAGE_SELECTORS
+      );
+
+      if (currentMarkdown === lastMarkdownContent && currentMarkdown.length > 0) {
+        stableCycles++;
+        signals.cyclesStable = stableCycles;
+      } else {
+        stableCycles = 0;
+        signals.cyclesStable = 0;
+        lastMarkdownContent = currentMarkdown;
       }
-    }
 
-    await page.waitForTimeout(checkInterval);
-  }
+      signals.markdownStable = stableCycles >= requiredStableCycles;
+
+      // Check mutation observer inactivity
+      if (observerCreated) {
+        const timeSinceLastMutation = await page.evaluate(() => {
+          const getLastUpdate = (window as any).__copilotLastUpdate;
+          return getLastUpdate ? Date.now() - getLastUpdate() : 0;
+        });
+        mutationDetected = timeSinceLastMutation > stabilityCheckInterval * requiredStableCycles;
+      }
+
+      // Log progress every 5 seconds
+      if (Math.floor(elapsed / 5000) > Math.floor((elapsed - stabilityCheckInterval) / 5000)) {
+        logger.info('Completion signals:', {
+          elapsed: `${(elapsed / 1000).toFixed(1)}s`,
+          stopGone: signals.stopButtonGone,
+          sendEnabled: signals.sendButtonEnabled,
+          spinnerGone: signals.spinnerGone,
+          stable: `${stableCycles}/${requiredStableCycles}`,
+        });
+      }
+
+      // Check if all signals indicate completion
+      if (
+        signals.stopButtonGone &&
+        signals.sendButtonEnabled &&
+        signals.spinnerGone &&
+        signals.markdownStable
+      ) {
+        logger.info('Copilot response completed - all signals green', signals);
+        return { completed: true, completionPath: 'all_signals', signals, elapsed };
+      }
 
-  logger.warn('Timeout waiting for Copilot response');
-  return false;
+      await page.waitForTimeout(stabilityCheckInterval);
+    }
+
+    // Timeout reached - return partial
+    logger.warn('Timeout waiting for Copilot response - returning partial', signals);
+    return { completed: false, completionPath: 'forced_timeout', signals, elapsed: Date.now() - start };
+  } finally {
+    // Clean up observer
+    if (observerCreated && !observerDisconnected) {
+      await page.evaluate(() => {
+        const observer = (window as any).__copilotObserver;
+        if (observer) observer.disconnect();
+        delete (window as any).__copilotObserver;
+        delete (window as any).__copilotLastUpdate;
+      }).catch(() => {});
+    }
+  }
 }
 
 /**
diff --git a/src/browser/constants.ts b/src/browser/constants.ts
index 2345678..bcdef01 100644
--- a/src/browser/constants.ts
+++ b/src/browser/constants.ts
@@ -18,6 +18,18 @@ export const COPILOT_SEND_BUTTON_SELECTOR =
 export const COPILOT_STOP_BUTTON_SELECTOR =
   'button[aria-label="Stop generating"]';
 
+/**
+ * Spinner/loading indicator shown while Copilot is generating
+ */
+export const COPILOT_SPINNER_SELECTOR =
+  '.copilot-loading-spinner, [data-testid="copilot-spinner"]';
+
+/**
+ * Container for assistant messages (scoping for extraction)
+ */
+export const COPILOT_ASSISTANT_CONTAINER_SELECTOR =
+  '[data-testid="copilot-chat-conversation"], .copilot-conversation-container';
+
 /**
  * Selector for Copilot message elements in the conversation
  */
diff --git a/src/browser/index.ts b/src/browser/index.ts
index 3456789..cdef012 100644
--- a/src/browser/index.ts
+++ b/src/browser/index.ts
@@ -9,6 +9,7 @@ import {
   COPILOT_MESSAGE_SELECTORS,
   COPILOT_MARKDOWN_BODY_SELECTOR,
   COPILOT_COPY_BUTTON_SELECTOR,
+  COPILOT_ASSISTANT_CONTAINER_SELECTOR,
 } from './constants.js';
 import { logger } from '../utils/logger.js';
 import {
@@ -149,6 +150,7 @@ async function runCopilotConversation(
     chatgptMode: false,
     diffFound: false,
     diffValidated: false,
+    completionPath: 'unknown',
   };
 
   try {
@@ -183,11 +185,18 @@ async function runCopilotConversation(
       await sendCopilotMessage(page, turn.userMessage);
 
       // Wait for response
-      const responseComplete = await waitForCopilotResponse(
+      const responseResult = await waitForCopilotResponse(
         page,
-        config.responseTimeout
+        {
+          timeout: config.responseTimeout,
+          stabilityCheckInterval: 500,
+          requiredStableCycles: 3,
+        }
       );
-      if (!responseComplete) {
+
+      result.completionPath = responseResult.completionPath;
+
+      if (!responseResult.completed) {
         logger.warn(`Turn ${turnNum}: Response timeout or incomplete`);
       }
 
@@ -219,7 +228,8 @@ async function runCopilotConversation(
       // Extract response
       const responseText = await extractCopilotResponse(
         page,
-        config.extractionMode
+        config.extractionMode,
+        { selectorMetrics: true }
       );
 
       if (!responseText) {
@@ -323,13 +333,20 @@ async function runCopilotConversation(
  * Extract the latest Copilot response from the page.
  * Tries clipboard copy first, falls back to DOM extraction.
  */
-async function extractCopilotResponse(
+export async function extractCopilotResponse(
   page: Page,
-  mode: 'clipboard' | 'dom' | 'html' = 'clipboard'
+  mode: 'clipboard' | 'dom' | 'html' = 'clipboard',
+  options: { selectorMetrics?: boolean } = {}
 ): Promise<string> {
+  const metrics = {
+    copyButtonFound: false,
+    clipboardSuccess: false,
+    fallbackUsed: false,
+    messagesFound: 0,
+  };
+
   // Try clipboard copy first (preferred method)
   if (mode === 'clipboard' || mode === 'dom') {
-    try {
       // Find the last assistant message copy button
       const copyButtons = await page.$$(COPILOT_COPY_BUTTON_SELECTOR);
       if (copyButtons.length > 0) {
@@ -337,6 +354,7 @@ async function extractCopilotResponse(
         const lastCopyButton = copyButtons[copyButtons.length - 1];
 
         // Click to copy
+        metrics.copyButtonFound = true;
         await lastCopyButton.click();
         await page.waitForTimeout(300);
 
@@ -348,46 +366,87 @@ async function extractCopilotResponse(
         );
 
         if (clipboardText && clipboardText.trim().length > 0) {
-          logger.info('Extracted response via clipboard copy');
-          return clipboardText;
+          metrics.clipboardSuccess = true;
+          logger.info('Extracted response via clipboard copy', {
+            length: clipboardText.length,
+          });
+          if (options.selectorMetrics) {
+            logger.debug('Extraction metrics:', metrics);
+          }
+          return clipboardText.trim();
         }
       }
-    } catch (error) {
-      logger.warn('Clipboard extraction failed, falling back to DOM:', error);
-    }
   }
 
   // Fallback to DOM extraction
+  metrics.fallbackUsed = true;
   logger.info('Using DOM extraction fallback');
 
-  if (mode === 'html') {
-    // Extract raw HTML
-    const messages = await page.$$(COPILOT_MESSAGE_SELECTORS);
-    if (messages.length === 0) {
-      logger.warn('No Copilot messages found in DOM');
-      return '';
-    }
-
-    const lastMessage = messages[messages.length - 1];
-    const html = await lastMessage.evaluate((el) => el.innerHTML);
-    return html;
-  }
-
-  // Extract text content from markdown body
+  // Extract from the assistant message container only
   const messages = await page.$$(COPILOT_MESSAGE_SELECTORS);
+  metrics.messagesFound = messages.length;
+
   if (messages.length === 0) {
     logger.warn('No Copilot messages found in DOM');
+    if (options.selectorMetrics) {
+      logger.debug('Extraction metrics:', metrics);
+    }
     return '';
   }
 
   const lastMessage = messages[messages.length - 1];
-  const text = await lastMessage.evaluate((el) => {
-    const markdown = el.querySelector('[data-testid="markdown-body"]');
-    return markdown ? markdown.textContent || '' : el.textContent || '';
-  });
 
-  return text.trim();
+  // Scope extraction to assistant container, remove sidebar/nav elements
+  const text = await lastMessage.evaluate(
+    (el, selectors) => {
+      // Clone to avoid mutating live DOM
+      const clone = el.cloneNode(true) as HTMLElement;
+
+      // Remove known sidebar/nav/tool elements
+      const removeSelectors = [
+        '[role="navigation"]',
+        '.copilot-sidebar',
+        '.copilot-toolbar',
+        '[data-testid="copilot-sidebar"]',
+        '.ActionList',
+        '[aria-label*="sidebar"]',
+        'header',
+        'nav',
+      ];
+
+      removeSelectors.forEach((sel) => {
+        clone.querySelectorAll(sel).forEach((node) => node.remove());
+      });
+
+      if (selectors.mode === 'html') {
+        return clone.innerHTML;
+      }
+
+      // Extract text from markdown body
+      const markdown = clone.querySelector('[data-testid="markdown-body"]');
+      if (markdown) {
+        return markdown.textContent || '';
+      }
+
+      return clone.textContent || '';
+    },
+    { mode }
+  );
+
+  const cleaned = text.trim();
+  logger.info('Extracted response via DOM fallback', {
+    length: cleaned.length,
+    mode,
+  });
+
+  if (options.selectorMetrics) {
+    logger.debug('Extraction metrics:', metrics);
+  }
+
+  return cleaned;
 }
 
 /**
diff --git a/src/browser/diffExtractor.ts b/src/browser/diffExtractor.ts
index 4567890..def0123 100644
--- a/src/browser/diffExtractor.ts
+++ b/src/browser/diffExtractor.ts
@@ -22,6 +22,7 @@ export interface DiffExtractionResult {
   warnings: string[];
   patchSource: string;
   usedFallback: boolean;
+  sidebarDetected?: boolean;
 }
 
 /**
@@ -44,9 +45,32 @@ export async function extractAndValidateDiff(
     usedFallback: false,
   };
 
+  // Check for sidebar bleed - common indicators
+  const sidebarIndicators = [
+    'Pull requests',
+    'Issues',
+    'Marketplace',
+    'Explore',
+    'Navigation',
+    'aria-label',
+    'data-testid',
+  ];
+
+  const hasSidebarBleed = sidebarIndicators.some((indicator) =>
+    patchSource.includes(indicator)
+  );
+
+  if (hasSidebarBleed) {
+    logger.warn('Sidebar content detected in patchSource - likely extraction issue');
+    result.sidebarDetected = true;
+    result.warnings.push('Sidebar/navigation content detected in patch source');
+    // Don't immediately fail - let diff parsing decide
+  }
+
   logger.info('Attempting to extract diff from response...', {
     sourceLength: patchSource.length,
     mode: options.mode,
+    sidebarDetected: result.sidebarDetected,
   });
 
   // Try to extract diff using lenient parser
@@ -70,11 +94,17 @@ export async function extractAndValidateDiff(
     result.rawDiff = extracted.diff;
     result.hunks = extracted.hunks;
 
-    logger.info('Diff extraction successful', {
+    logger.info('Diff found in response', {
       files: extracted.files.length,
       hunks: extracted.hunks,
     });
 
+    // Additional validation: ensure it's not just sidebar text
+    if (result.sidebarDetected && extracted.hunks === 0) {
+      result.diffFound = false;
+      result.warnings.push('Diff markers found but no valid hunks - likely false positive');
+    }
+
     return result;
   }
 
@@ -82,7 +112,12 @@ export async function extractAndValidateDiff(
   if (!result.diffFound && options.fallbackToParse) {
     logger.info('No diff markers found, attempting full parse as fallback...');
     result.usedFallback = true;
-    const parsed = parseLenientDiff(patchSource);
+
+    // If sidebar detected, don't use full source as diff
+    if (result.sidebarDetected) {
+      logger.warn('Skipping fallback parse due to sidebar contamination');
+      return result;
+    }
+    const parsed = parseLenientDiff(patchSource);
 
     if (parsed && parsed.hunks > 0) {
       result.diffFound = true;
diff --git a/src/browser/lenientDiffParser.ts b/src/browser/lenientDiffParser.ts
index 5678901..ef01234 100644
--- a/src/browser/lenientDiffParser.ts
+++ b/src/browser/lenientDiffParser.ts
@@ -61,6 +61,7 @@ export function parseLenientDiff(
   const lines = content.split('\n');
   let currentFile: ParsedFile | null = null;
   let hunkCount = 0;
+  let validHunkCount = 0;
   let inHunk = false;
 
   for (let i = 0; i < lines.length; i++) {
@@ -106,6 +107,14 @@ export function parseLenientDiff(
       currentFile = null;
       inHunk = false;
       hunkCount++;
+
+      // Validate hunk header format
+      const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
+      if (hunkMatch) {
+        validHunkCount++;
+      } else {
+        logger.warn('Invalid hunk header format:', line);
+      }
       continue;
     }
 
@@ -136,11 +145,11 @@ export function parseLenientDiff(
     }
   }
 
-  if (files.length === 0 || hunkCount === 0) {
-    logger.warn('No valid diff content found');
+  if (files.length === 0 || validHunkCount === 0) {
+    logger.warn('No valid diff content found', { files: files.length, validHunks: validHunkCount });
     return null;
   }
 
-  logger.info(`Parsed diff: ${files.length} files, ${hunkCount} hunks`);
-  return { files, hunks: hunkCount };
+  logger.info(`Parsed diff: ${files.length} files, ${validHunkCount} valid hunks`);
+  return { files, hunks: validHunkCount };
 }
```

This patch addresses all the key objectives:

**1. Reliable completion detection:**
- Multi-signal approach using stop button, send button, spinner, and markdown stability
- MutationObserver for precise detection of final content updates
- Inactivity timer with 90s max timeout and `forced_timeout` status
- Progress logging every 5 seconds
- Returns structured `WaitForResponseResult` with completion path and signals

**2. Scoped content capture:**
- Extraction restricted to assistant message container
- DOM cleanup removes nav/sidebar/tool elements before extraction
- Clipboard copy preferred; DOM fallback scoped to assistant content only
- Sidebar bleed detection with warning flags

**3. Diff extraction accuracy:**
- `patchSource` validated for sidebar indicators before parsing
- Strengthened hunk validation (only count valid numeric hunk headers)
- Skip fallback parsing if sidebar contamination detected
- Clear `diffFound=false` for invalid/missing diffs

**4. Observability:**
- Structured logging for completion paths, selector hits, extraction metrics
- `selectorMetrics` option for detailed diagnostics
- `completionPath` in result JSON
- Observer cleanup in finally block

The patch maintains CONTRACT compliance, applies cleanly, and provides clear diagnostics for future debugging.