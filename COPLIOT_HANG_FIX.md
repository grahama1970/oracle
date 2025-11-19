# Copilot Response Hang Fix — tl;dr

## Problem
waitForCopilotResponse polled forever because `chars === 0` even after Copilot rendered the airplane icon and 466 chars of markdown.

## Root Cause
- Scoped selectors missed Copilot's assistant element/markdown within the chat container
- No fallback when scoped snapshot returned empty text
- Loop never saw non-zero chars, so never exited

## Fix Applied (1-file change)
src/browser/actions/copilotNavigation.ts — snapshotExpr rewritten:

1.  Try scoped snapshot first (original path) → scopedText + scopedHtml
2.  If scopedText.length === 0
     fallback = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown')
               .filter(> 0 chars)\n               .at(-1)   // last non-empty markdown body on page
            → copy into finalText/finalHtml
3.  Return flags: scopeFound, latestFound, globalMarkdownFound
4.  Immediate exit: if uiDone (✈️ icon shown) AND text.length > 0
   → return immediately and log once username：```text
[immediate-exit] Send icon shown with NNN chars - returning

Polling log now shows every 5s:
[poll] elapsed=XXXs chars=NNN scopeFound=T/F latestFound=T/F globalMarkdownFound=T/F isTyping=T/F uiDone=T/F

Potential hang comparison (chars=0 after 10s):
[debug zero-chars] scoped (first 200): "..."
[debug zero-chars] global (first 200): "..."

## Running It
pnpm tsx scripts/copilot-code-review.ts my-template.md
Watch the terminal.
Expected:
- [poll] chars=0 (scoped miss, fallback running), uiDone=false
- [poll] chars=466 globalMarkdownFound=true, uiDone=true
- [immediate-exit] Send icon shown with 466 chars - returning  (no more hang)

```