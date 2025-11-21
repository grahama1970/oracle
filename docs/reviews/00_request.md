# Stabilize Copilot completion detection and strip sidebar bleed in browser transport

## Repository and branch
- **Repo:** `grahama1970/oracle`
- **Branch:** `feat/copilot-auth-review`
- **Paths of interest:**
  - `src/browser/actions/copilotNavigation.ts` (response wait logic)
  - `src/browser/constants.ts` (Copilot selectors/scopes)
  - `src/browser/index.ts` (patch source selection, clipboard fallback)
  - `src/browser/diffExtractor.ts` / `src/browser/lenientDiffParser.ts` (diff parsing/validation)
  - `scripts/copilot-code-review.ts` (entrypoint expectations)
  - Diagnostic artifacts: `tmp/COPILOT_REVIEW_SMOKE-*`, `tmp/COPILOT_REVIEW_RESPONSE_STABILIZATION-*`

## Summary
Browser-mode Copilot runs sometimes never exit because we mis-detect when the assistant is “done.” The polling loop can stick while Copilot continues to stream, and the extracted “answer” often includes sidebar/tool text instead of just the latest assistant markdown, producing `result.json`/patch outputs with the entire page rather than a unified diff + clarifying answers. We need a robust, contract-compliant completion signal plus tighter DOM scoping so only the assistant turn is captured.

## Objectives
1) **Reliable completion detection (no hangs)**
   - Extend/replace `waitForCopilotResponse` to use multiple signals: disappearance of stop/spinner controls, send-button enabled, markdown body stability, and a “latest assistant message” watcher (MutationObserver).
   - Add an inactivity + max-wall timer safety valve that always returns the latest assistant turn instead of hanging indefinitely.
   - Emit clear status in logs/session JSON so downstream agents can trust `status=success` maps to a fully received answer.

2) **Scoped content capture (no sidebar bleed)**
   - Restrict extraction to the latest assistant message inside `COPILOT_MESSAGE_SELECTORS` / `COPILOT_MARKDOWN_BODY_SELECTOR`, with DOM cleanup that removes nav/sidebar/tool elements.
   - Prefer the per-turn “Copy” button when present; if falling back to DOM/HTML, scope to the assistant container only.
   - Ensure `patchSource` forwarded to diff parsing excludes surrounding UI text.

3) **Diff extraction accuracy**
   - Keep `patchSource` to the assistant markdown only; reject captures that include sidebar text.
   - Strengthen `lenientDiffParser`/validation so `diffFound=true` only when a valid unified diff is present; otherwise surface `diff_missing/invalid_diff` instead of returning garbage content.

4) **Observability and guardrails**
   - Add structured logs/metrics for: completion path taken, stable-cycle counts, selector hits, and whether clipboard vs DOM was used.
   - Maintain CONTRACT outputs (`result.json`, exit codes, snapshots) and avoid regressions in ChatGPT mode.

## Constraints for the patch
- Output must be a single fenced ```diff block containing a unified diff; first line is a one-line commit subject.
- Numeric hunk headers only (`@@ -old,+new @@`); paths must be relative (no `../`, no absolute).
- Apply cleanly on `feat/copilot-auth-review`.
- No extra commentary or links in the Copilot reply besides answers + diff.
- Honor CONTRACT behaviors for browser mode (sessions, artifacts, statuses, exit codes).

## Acceptance criteria
- `pnpm tsx scripts/copilot-code-review.ts tmp/test-copilot-review.md --max-turns 3 --apply-mode none` completes without hanging and logs a clear “response complete” path.
- `tmp/*copilot-review*-turn-1.patch` (or `diff.patch` for the session) contains only the assistant’s unified diff; no sidebar/menu text appears in `result.json` or `*-no-diff.txt`.
- `result.json` shows `status="success"`, `diffFound=true|false` (truthful), `diffValidated` consistent, and `responseChars` reflects only the assistant turn.
- DOM snapshots (if enabled) stay under the conversation container; no full-page bleed.
- Contract exit codes respected: no indefinite waits when Copilot continues streaming.

## Test plan
1. Run the scripted check: `pnpm tsx scripts/copilot-code-review.ts tmp/test-copilot-review.md --max-turns 3 --apply-mode none`.
2. If a hang was previously reproducible, re-run with `ORACLE_NO_DETACH=1` and confirm completion < timeout (e.g., 90s) with “response complete” log.
3. Inspect `tmp/copilot-review-*-log` for completion path and selector hits; ensure no “sidebar” text in `patchSource`/`result.json`.
4. (Optional) Enable snapshots (`--dom-snapshot 2000`) and verify snapshots only include the assistant message column.

## Clarifying questions
1. Is it acceptable to add a MutationObserver anchored to `COPILOT_MESSAGE_SELECTORS` to detect the final token, or should we stick to polling-only for safety?
2. Should we drop the HTML fallback entirely when clipboard copy succeeds, to avoid sidebar bleed, or keep it as a last resort with stricter scoping?
3. What wall-clock timeout is acceptable before forcing a return (e.g., 90s)? Should we surface a distinct `status="timeout_partial"` if we bail early with partial text?
4. Do we want to gate “response complete” on minimum markdown length or on detecting code fences/patch markers?
5. May we record selector hit/miss metrics in `metrics.json` to aid future drift triage?

## Deliverable
Return:
- A single fenced unified diff (per constraints above) implementing the best approach for completion detection + scoped capture + diff validation.
- Answers to the clarifying questions above, outside the diff block.
