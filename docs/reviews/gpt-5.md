```diff
Stabilize Copilot completion detection and scoped diff extraction in browser transport
@@ -1,0 +1,320 @@
+diff --git a/src/browser/constants.ts b/src/browser/constants.ts
+index 1111111..2222222 100644
+--- a/src/browser/constants.ts
++++ b/src/browser/constants.ts
+@@ -1,6 +1,40 @@
+ export const COPILOT_URL = "https://chatgpt.com";
+ 
+-export const COPILOT_MESSAGE_SELECTORS = [
+-  '[data-message-author-role="assistant"]',
+-  '[data-message-author-role="gpt"]',
+-];
++/**
++ * Selector(s) that match individual assistant messages in the main conversation
++ * column only. These SHOULD NOT match sidebar, history, or tools panes.
++ */
++export const COPILOT_MESSAGE_SELECTORS = [
++  // Main conversation thread messages
++  '[data-message-author-role="assistant"][data-message-type="assistant"]',
++  '[data-message-author-role="assistant"]:not([data-testid="conversation-turn-sidebar"])',
++  // Fallback for older DOMs, still scoped to conversation container at query time
++  '[data-message-author-role="gpt"]',
++];
++
++/**
++ * Selector that resolves to the main conversation container, excluding sidebar,
++ * nav, and tool panes. All message queries MUST be scoped under this node to
++ * avoid sidebar bleed.
++ */
++export const COPILOT_CONVERSATION_CONTAINER_SELECTOR =
++  '[data-testid="conversation-panel"], main[role="main"] section:has([data-message-author-role])';
++
++/**
++ * Selector for the markdown body within a single assistant message.
++ */
++export const COPILOT_MARKDOWN_BODY_SELECTOR =
++  '[data-message-author-role="assistant"] .markdown, [data-message-author-role="gpt"] .markdown, .prose';
++
++/**
++ * Selector for the per-message "Copy" button on an assistant turn.
++ * This is preferred over DOM scraping when present.
++ */
++export const COPILOT_MESSAGE_COPY_BUTTON_SELECTOR =
++  '[data-testid="copy-message"], button[aria-label*="Copy message"], button[aria-label*="Copy code"]';
++
++/**
++ * Timeouts and stability thresholds for Copilot completion detection.
++ */
++export const COPILOT_RESPONSE_MAX_WALL_CLOCK_MS = 90_000;
++export const COPILOT_RESPONSE_INACTIVITY_MS = 5_000;
++export const COPILOT_RESPONSE_STABLE_CYCLES = 3;
+diff --git a/src/browser/actions/copilotNavigation.ts b/src/browser/actions/copilotNavigation.ts
+index 3333333..4444444 100644
+--- a/src/browser/actions/copilotNavigation.ts
++++ b/src/browser/actions/copilotNavigation.ts
+@@ -1,9 +1,182 @@
+ import type { Page } from "puppeteer";
+ import {
+   COPILOT_URL,
+-  COPILOT_MESSAGE_SELECTORS,
+-  COPILOT_MARKDOWN_BODY_SELECTOR,
++  COPILOT_MESSAGE_SELECTORS,
++  COPILOT_MARKDOWN_BODY_SELECTOR,
++  COPILOT_CONVERSATION_CONTAINER_SELECTOR,
++  COPILOT_RESPONSE_MAX_WALL_CLOCK_MS,
++  COPILOT_RESPONSE_INACTIVITY_MS,
++  COPILOT_RESPONSE_STABLE_CYCLES,
+ } from "../constants";
+ 
++export type CopilotCompletionStatus =
++  | "success"
++  | "timeout_partial"
++  | "no_assistant_message";
++
++export interface CopilotCompletionResult {
++  status: CopilotCompletionStatus;
++  markdown: string;
++  responseChars: number;
++  completionPath: string;
++  stableCycles: number;
++  selectorHits: {
++    conversationContainer: boolean;
++    latestAssistantFound: boolean;
++    markdownBodyFound: boolean;
++  };
++}
++
++async function getLatestAssistantMarkdown(page: Page): Promise<{
++  markdown: string;
++  selectorHits: CopilotCompletionResult["selectorHits"];
++}> {
++  return page.evaluate(
++    (
++      conversationSelector: string,
++      messageSelectors: string[],
++      markdownSelector: string,
++    ) => {
++      const selectorHits: CopilotCompletionResult["selectorHits"] = {
++        conversationContainer: false,
++        latestAssistantFound: false,
++        markdownBodyFound: false,
++      };
++
++      const conversationRoot =
++        document.querySelector(conversationSelector) ?? document.body;
++      if (conversationRoot) {
++        selectorHits.conversationContainer =
++          conversationRoot !== document.body;
++      }
++
++      const messageNodes: Element[] = [];
++      for (const sel of messageSelectors) {
++        conversationRoot
++          .querySelectorAll(sel)
++          .forEach((el) => messageNodes.push(el));
++      }
++
++      if (!messageNodes.length) {
++        return { markdown: "", selectorHits };
++      }
++
++      const latestAssistant = messageNodes[messageNodes.length - 1];
++      selectorHits.latestAssistantFound = true;
++
++      const markdownNode =
++        latestAssistant.querySelector(markdownSelector) ?? latestAssistant;
++      if (markdownNode) {
++        selectorHits.markdownBodyFound =
++          markdownNode.matches(markdownSelector) ||
++          !!markdownNode.closest(markdownSelector);
++      }
++
++      // Strip obvious sidebar / nav / tool elements under the message node
++      const clone = markdownNode.cloneNode(true) as HTMLElement;
++      clone
++        .querySelectorAll(
++          'nav, aside, header, footer, [role="navigation"], [data-testid*="sidebar"], [aria-label*="History"], [aria-label*="Sidebar"]',
++        )
++        .forEach((el) => el.remove());
++
++      const text = clone.innerText ?? "";
++      return { markdown: text.trim(), selectorHits };
++    },
++    COPILOT_CONVERSATION_CONTAINER_SELECTOR,
++    COPILOT_MESSAGE_SELECTORS,
++    COPILOT_MARKDOWN_BODY_SELECTOR,
++  );
++}
++
++/**
++ * Waits for Copilot to finish streaming the current assistant response using
++ * multiple completion signals plus a MutationObserver-backed stability check.
++ *
++ * This function is defensive: it will always return within
++ * COPILOT_RESPONSE_MAX_WALL_CLOCK_MS, returning the best-effort latest
++ * assistant message with status "timeout_partial" if needed.
++ */
+ export async function waitForCopilotResponse(
+   page: Page,
+-): Promise<void> {
+-  await page.waitForSelector(COPILOT_MESSAGE_SELECTORS.join(","), {
+-    timeout: 60_000,
+-  });
++): Promise<CopilotCompletionResult> {
++  const start = Date.now();
++  let lastLength = 0;
++  let stableCycles = 0;
++  let completionPath = "unknown";
++  let lastMarkdown = "";
++  let lastSelectorHits: CopilotCompletionResult["selectorHits"] = {
++    conversationContainer: false,
++    latestAssistantFound: false,
++    markdownBodyFound: false,
++  };
++
++  // Set up a lightweight MutationObserver that toggles a flag whenever the
++  // latest assistant message changes.
++  await page.evaluate(
++    (conversationSelector: string, messageSelectors: string[]) => {
++      const root =
++        document.querySelector(conversationSelector) ?? document.body;
++      if (!root) return;
++
++      // @ts-ignore
++      if (window.__oracleCopilotObserverAttached) return;
++      // @ts-ignore
++      window.__oracleCopilotObserverAttached = true;
++      // @ts-ignore
++      window.__oracleCopilotLastMutation = Date.now();
++
++      const observer = new MutationObserver(() => {
++        // @ts-ignore
++        window.__oracleCopilotLastMutation = Date.now();
++      });
++
++      observer.observe(root, {
++        childList: true,
++        subtree: true,
++        characterData: true,
++      });
++    },
++    COPILOT_CONVERSATION_CONTAINER_SELECTOR,
++    COPILOT_MESSAGE_SELECTORS,
++  );
++
++  const poll = async (): Promise<CopilotCompletionResult> => {
++    // Hard wall-clock timeout
++    const now = Date.now();
++    if (now - start > COPILOT_RESPONSE_MAX_WALL_CLOCK_MS) {
++      completionPath = "wall_clock_timeout";
++      return {
++        status: lastMarkdown ? "timeout_partial" : "no_assistant_message",
++        markdown: lastMarkdown,
++        responseChars: lastMarkdown.length,
++        completionPath,
++        stableCycles,
++        selectorHits: lastSelectorHits,
++      };
++    }
++
++    const { markdown, selectorHits } = await getLatestAssistantMarkdown(page);
++    lastSelectorHits = selectorHits;
++    if (markdown) {
++      lastMarkdown = markdown;
++    }
++
++    const currentLength = markdown.length;
++    if (currentLength === lastLength && currentLength > 0) {
++      stableCycles += 1;
++    } else {
++      stableCycles = 0;
++    }
++    lastLength = currentLength;
++
++    // Primary completion condition: multiple stable cycles + UI-ready signals.
++    const isSendEnabledAndNoSpinner = await page.evaluate(() => {
++      const sendButton = document.querySelector<HTMLButtonElement>(
++        'button[type="submit"][data-testid="send-button"], button[aria-label*="Send"]',
++      );
++      const spinner =
++        document.querySelector("[data-testid*='spinner']") ??
++        document.querySelector('[aria-label*="Stop generating"]');
++      const sendReady = !!sendButton && !sendButton.disabled;
++      const spinnerGone = !spinner;
++      return sendReady && spinnerGone;
++    });
++
++    if (
++      isSendEnabledAndNoSpinner &&
++      currentLength > 0 &&
++      stableCycles >= COPILOT_RESPONSE_STABLE_CYCLES
++    ) {
++      completionPath = "ui_signals+stable_markdown";
++      return {
++        status: "success",
++        markdown: markdown || lastMarkdown,
++        responseChars: (markdown || lastMarkdown).length,
++        completionPath,
++        stableCycles,
++        selectorHits,
++      };
++    }
++
++    // Secondary completion condition: inactivity window with some content.
++    const inactiveTooLong = await page.evaluate(
++      (inactivityMs: number) => {
++        // @ts-ignore
++        const last = window.__oracleCopilotLastMutation as
++          | number
++          | undefined;
++        if (!last) return false;
++        return Date.now() - last > inactivityMs;
++      },
++      COPILOT_RESPONSE_INACTIVITY_MS,
++    );
++
++    if (inactiveTooLong && currentLength > 0) {
++      completionPath = "inactivity_timeout_with_content";
++      return {
++        status: "timeout_partial",
++        markdown: markdown || lastMarkdown,
++        responseChars: (markdown || lastMarkdown).length,
++        completionPath,
++        stableCycles,
++        selectorHits,
++      };
++    }
++
++    // Keep polling.
++    await page.waitForTimeout(500);
++    return poll();
++  };
++
++  return poll();
+ }
+diff --git a/src/browser/index.ts b/src/browser/index.ts
+index 5555555..6666666 100644
+--- a/src/browser/index.ts
++++ b/src/browser/index.ts
+@@ -1,12 +1,48 @@
+ import type { Page } from "puppeteer";
+ import {
+   COPILOT_MESSAGE_SELECTORS,
+-  COPILOT_MARKDOWN_BODY_SELECTOR,
++  COPILOT_MARKDOWN_BODY_SELECTOR,
++  COPILOT_MESSAGE_COPY_BUTTON_SELECTOR,
++  COPILOT_CONVERSATION_CONTAINER_SELECTOR,
+ } from "./constants";
+-import { waitForCopilotResponse } from "./actions/copilotNavigation";
++import {
++  waitForCopilotResponse,
++  type CopilotCompletionResult,
++} from "./actions/copilotNavigation";
+ import { extractDiffFromResponse } from "./diffExtractor";
+ 
+-export async function runCopilotReview(page: Page): Promise<void> {
+-  await waitForCopilotResponse(page);
++export interface CopilotRunMetrics {
++  completion: CopilotCompletionResult;
++  patchSourceStrategy: "clipboard" | "dom_scoped";
++}
++
++async function getAssistantMarkdownFromClipboard(page: Page): Promise<string> {
++  return page.evaluate(async () => {
++    try {
++      // Prefer the per-turn copy button for the latest assistant message.
++      const conversationRoot =
++        document.querySelector(
++          '[data-testid="conversation-panel"], main[role="main"] section:has([data-message-author-role])',
++        ) ?? document.body;
++      const assistantMessages = conversationRoot.querySelectorAll(
++        '[data-message-author-role="assistant"], [data-message-author-role="gpt"]',
++      );
++      const latest =
++        assistantMessages[assistantMessages.length - 1] ?? null;
++      if (!latest) return "";
++
++      const copyButton =
++        latest.querySelector<HTMLButtonElement>(
++          '[data-testid="copy-message"], button[aria-label*="Copy message"], button[aria-label*="Copy code"]',
++        );
++      if (!copyButton) return "";
++
++      (copyButton as HTMLButtonElement).click();
++      const text = await navigator.clipboard.readText();
++      return (text ?? "").trim();
++    } catch {
++      return "";
++    }
++  });
++}
++
++export async function runCopilotReview(page: Page): Promise<CopilotRunMetrics> {
++  const completion = await waitForCopilotResponse(page);
++
+   // Prefer clipboard content from the last assistant turn, falling back to DOM.
+-  let patchSource = await page.evaluate(async () => {
+-    try {
+-      const text = await navigator.clipboard.readText();
+-      return text ?? "";
+-    } catch {
+-      return "";
+-    }
+-  });
++  let patchSource = await getAssistantMarkdownFromClipboard(page);
++  let patchSourceStrategy: CopilotRunMetrics["patchSourceStrategy"] =
++    "clipboard";
++
+   if (!patchSource) {
+-    patchSource = await page.evaluate(
+-      (selectors: string, markdownSelector: string) => {
+-        const nodes = document.querySelectorAll(selectors);
+-        const last = nodes[nodes.length - 1] as HTMLElement | undefined;
+-        if (!last) return "";
+-        const markdown =
+-          last.querySelector<HTMLElement>(markdownSelector) ?? last;
+-        return markdown.innerText ?? "";
+-      },
+-      COPILOT_MESSAGE_SELECTORS.join(","),
+-      COPILOT_MARKDOWN_BODY_SELECTOR,
+-    );
++    patchSourceStrategy = "dom_scoped";
++    patchSource = await page.evaluate(
++      (
++        conversationSelector: string,
++        messageSelectors: string[],
++        markdownSelector: string,
++      ) => {
++        const conversationRoot =
++          document.querySelector(conversationSelector) ?? document.body;
++        const messageNodes: Element[] = [];
++        for (const sel of messageSelectors) {
++          conversationRoot
++            .querySelectorAll(sel)
++            .forEach((el) => messageNodes.push(el));
++        }
++        const latest = messageNodes[messageNodes.length - 1] as
++          | HTMLElement
++          | undefined;
++        if (!latest) return "";
++        const markdown =
++          latest.querySelector<HTMLElement>(markdownSelector) ?? latest;
++
++        const clone = markdown.cloneNode(true) as HTMLElement;
++        clone
++          .querySelectorAll(
++            'nav, aside, header, footer, [role="navigation"], [data-testid*="sidebar"], [aria-label*="History"], [aria-label*="Sidebar"]',
++          )
++          .forEach((el) => el.remove());
++
++        return (clone.innerText ?? "").trim();
++      },
++      COPILOT_CONVERSATION_CONTAINER_SELECTOR,
++      COPILOT_MESSAGE_SELECTORS,
++      COPILOT_MARKDOWN_BODY_SELECTOR,
++    );
+   }
+ 
+-  await extractDiffFromResponse(patchSource);
++  await extractDiffFromResponse(patchSource, {
++    responseChars: completion.responseChars,
++    completionStatus: completion.status,
++    completionPath: completion.completionPath,
++    selectorHits: completion.selectorHits,
++    patchSourceStrategy,
++  });
++
++  return { completion, patchSourceStrategy };
+ }
+diff --git a/src/browser/diffExtractor.ts b/src/browser/diffExtractor.ts
+index 7777777..8888888 100644
+--- a/src/browser/diffExtractor.ts
++++ b/src/browser/diffExtractor.ts
+@@ -1,11 +1,56 @@
+ import { parseLenientUnifiedDiff } from "./lenientDiffParser";
+ 
+-export async function extractDiffFromResponse(
+-  responseText: string,
+-): Promise<void> {
+-  const { diff, diffFound } = parseLenientUnifiedDiff(responseText);
+-  // existing behavior: write artifacts, result.json, etc.
+-  // ...
++export interface DiffExtractionContext {
++  responseChars: number;
++  completionStatus: string;
++  completionPath: string;
++  selectorHits: {
++    conversationContainer: boolean;
++    latestAssistantFound: boolean;
++    markdownBodyFound: boolean;
++  };
++  patchSourceStrategy: "clipboard" | "dom_scoped";
++}
++
++export interface DiffExtractionResult {
++  status: "success" | "diff_missing" | "invalid_diff";
++  diffFound: boolean;
++  diffValidated: boolean;
++  diff?: string;
++  responseChars: number;
++  completionStatus: string;
++  completionPath: string;
++  selectorHits: DiffExtractionContext["selectorHits"];
++  patchSourceStrategy: DiffExtractionContext["patchSourceStrategy"];
++}
++
++function looksLikeSidebarBleed(source: string): boolean {
++  const lower = source.toLowerCase();
++  return (
++    lower.includes("history") &&
++    lower.includes("sidebar") &&
++    lower.includes("upgrade") // very unlikely to be part of a diff
++  );
++}
++
++export async function extractDiffFromResponse(
++  responseText: string,
++  ctx: DiffExtractionContext,
++): Promise<DiffExtractionResult> {
++  const sanitized = responseText.trim();
++
++  if (!sanitized || looksLikeSidebarBleed(sanitized)) {
++    return {
++      status: "diff_missing",
++      diffFound: false,
++      diffValidated: false,
++      responseChars: ctx.responseChars,
++      completionStatus: ctx.completionStatus,
++      completionPath: ctx.completionPath,
++      selectorHits: ctx.selectorHits,
++      patchSourceStrategy: ctx.patchSourceStrategy,
++    };
++  }
++
++  const { diff, diffFound, diffValidated } =
++    parseLenientUnifiedDiff(sanitized);
++
++  const status: DiffExtractionResult["status"] = diffFound
++    ? diffValidated
++      ? "success"
++      : "invalid_diff"
++    : "diff_missing";
++
++  return {
++    status,
++    diffFound,
++    diffValidated,
++    diff: diffFound ? diff : undefined,
++    responseChars: ctx.responseChars,
++    completionStatus: ctx.completionStatus,
++    completionPath: ctx.completionPath,
++    selectorHits: ctx.selectorHits,
++    patchSourceStrategy: ctx.patchSourceStrategy,
++  };
+ }
+diff --git a/src/browser/lenientDiffParser.ts b/src/browser/lenientDiffParser.ts
+index 9999999..aaaaaaa 100644
+--- a/src/browser/lenientDiffParser.ts
++++ b/src/browser/lenientDiffParser.ts
+@@ -1,15 +1,64 @@
+-export function parseLenientUnifiedDiff(source: string): {
+-  diffFound: boolean;
+-  diff: string;
+-} {
+-  const start = source.indexOf("--- ");
+-  if (start === -1) {
+-    return { diffFound: false, diff: "" };
+-  }
+-  const candidate = source.slice(start);
+-  // minimal validation
+-  if (!candidate.includes("\n+++ ")) {
+-    return { diffFound: false, diff: "" };
+-  }
+-  return { diffFound: true, diff: candidate };
++export function parseLenientUnifiedDiff(source: string): {
++  diffFound: boolean;
++  diffValidated: boolean;
++  diff: string;
++} {
++  const start = source.indexOf("\n--- ");
++  const startAlt = source.startsWith("--- ") ? 0 : -1;
++  const idx = startAlt === 0 ? 0 : start;
++
++  if (idx === -1) {
++    return { diffFound: false, diffValidated: false, diff: "" };
++  }
++
++  const candidate = source.slice(idx).trim();
++
++  // Basic structural validation of a unified diff:
++  // - starts with --- and +++
++  // - has at least one hunk header with numeric ranges
++  const lines = candidate.split("\n");
++  if (lines.length < 3) {
++    return { diffFound: false, diffValidated: false, diff: "" };
++  }
++
++  const headerOk =
++    lines[0].startsWith("--- ") && lines[1].startsWith("+++ ");
++  if (!headerOk) {
++    return { diffFound: false, diffValidated: false, diff: "" };
++  }
++
++  const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
++  const hasNumericHunk = lines.some((l) => hunkHeaderRegex.test(l));
++
++  if (!hasNumericHunk) {
++    // We still report diffFound so downstream can surface "invalid_diff".
++    return {
++      diffFound: true,
++      diffValidated: false,
++      diff: candidate,
++    };
++  }
++
++  return {
++    diffFound: true,
++    diffValidated: true,
++    diff: candidate,
++  };
+ }
+diff --git a/scripts/copilot-code-review.ts b/scripts/copilot-code-review.ts
+index bbbbbbb..ccccccc 100644
+--- a/scripts/copilot-code-review.ts
++++ b/scripts/copilot-code-review.ts
+@@ -1,12 +1,32 @@
+ import { launchBrowser } from "../src/browser/launch";
+-import { runCopilotReview } from "../src/browser";
++import { runCopilotReview } from "../src/browser";
+ import { writeFileSync } from "fs";
+ import { join } from "path";
+ 
+ async function main() {
+   const browser = await launchBrowser();
+   const page = await browser.newPage();
+ 
+-  await runCopilotReview(page);
++  const metrics = await runCopilotReview(page);
++
++  const resultPath = join(process.cwd(), "tmp", "result.json");
++  const result = {
++    status: metrics.completion.status,
++    diffFound: undefined as boolean | undefined,
++    diffValidated: undefined as boolean | undefined,
++    responseChars: metrics.completion.responseChars,
++    completionPath: metrics.completion.completionPath,
++    selectorHits: metrics.completion.selectorHits,
++    patchSourceStrategy: metrics.patchSourceStrategy,
++  };
++
++  writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
+ 
+   await browser.close();
+ }
+ 
+ main().catch((err) => {
+   console.error(err);
+   process.exit(1);
+ });
```

Answers to clarifying questions:

1. Yes, it is acceptable to add a MutationObserver anchored under `COPILOT_CONVERSATION_CONTAINER_SELECTOR` / `COPILOT_MESSAGE_SELECTORS` to help detect completion; it should be used alongside polling and UI signals as implemented above.
2. Keep the HTML/DOM fallback as a last resort with strict scoping (conversation container + assistant message + DOM cleanup), but when clipboard copy succeeds from the per-turn “Copy” button, that result should fully replace the HTML fallback.
3. A 90s wall-clock timeout is appropriate; when we bail due to this timeout or inactivity with incomplete UI signals, we should surface `status="timeout_partial"` in the session/result metadata, as done via `CopilotCompletionResult.status`.
4. We should not hard-gate “response complete” on minimum markdown length or code-fence detection; instead, we rely on multi-signal stability (UI readiness, MutationObserver inactivity, stable markdown length), optionally logging when code fences or `@@`/diff markers are present for observability.
5. Yes, recording selector hit/miss metrics and completion paths in `metrics.json` (or equivalent structured logs) is desirable and aligns with the added `selectorHits`, `completionPath`, and `patchSourceStrategy` fields.