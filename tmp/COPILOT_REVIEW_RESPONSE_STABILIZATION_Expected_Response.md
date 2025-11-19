<!--
  Copilot review request for the Oracle Copilot response stabilization / hanging bug.
  Follows the structure of docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md.
-->

# Fix Copilot response stabilization so Oracle stops hanging on completed replies

## Repository and branch

- **Repo:** `grahama1970/oracle`
- **Branch:** `feat/copilot-auth-review`
- **Paths of interest:**
  - `src/browser/actions/copilotNavigation.ts`
  - `scripts/copilot-code-review.ts`
  - `src/browser/diffExtractor.ts`
  - `src/browser/constants.ts`
  - `docs/CONTRACT.md`
  - `tmp/copilot-review-latest.log` (example of the hanging session)

## Summary

Oracle’s Copilot browser transport successfully sends a review request, Copilot
produces a full markdown reply (including a patch block), but the run often
“hangs” in the `waitForCopilotResponse` loop until the hard timeout.

Symptoms:

1. The captured log (`tmp/copilot-review-latest.log`) clearly shows:
   - The review request prompt,
   - Copilot’s natural language explanation,
   - A patch-style block (`*** Begin Patch` / `*** Update File`),
   - Closing notes.
2. Despite this, `waitForCopilotResponse` does not log
   `"Copilot response complete ✓"` and does not return a stable snapshot in a
   reasonable time; the script continues polling until the ~10 minute timeout.
3. Downstream, `scripts/copilot-code-review.ts` sees the text, but the diff
   extractor / validator either:
   - Rejects the patch as not being a strict git unified diff, or
   - Never reaches the point where it can emit a `copilot-review-turn-*.patch`
     file before the run is aborted.

Copilot’s job is to:

- Audit the current stabilization heuristics plus diff extraction logic.
- Propose a minimal, robust change that:
  - Treats the response as “done” once Copilot’s answer is clearly present,
    even when UI chrome text is also visible.
  - Avoids hanging in the wait loop once the assistant reply is complete.
  - Normalizes patch-like blocks (e.g., `*** Begin Patch`) into a canonical
    unified diff that Oracle can validate and optionally apply.

## Objectives

1. **Stabilization heuristics**
   - Review `waitForCopilotResponse` in `copilotNavigation.ts` and its use of:
     - `hasAirplane` / `hasStopIcon` / `loadingAttr`,
     - `baselineText`, `seenNewText`, `stableCycles`,
     - Chrome/nav text filtering and length limits.
   - Ensure we have a reliable definition of “response complete” that:
     - Works when Copilot shows sidebars / history chrome,
     - Works when the last assistant message is clearly the review answer,
     - Does not require waiting for perfectly stable text when that’s not
       necessary.

2. **Timeout and fallback behavior**
   - Propose a safe fallback path when:
     - Copilot has clearly produced a long-form answer,
     - But the strict stabilization conditions are not met quickly.
   - Examples could include:
     - Switching to a simpler “latest assistant markdown body” snapshot after
       a certain elapsed time,
     - Using a “last-change timestamp” rather than repeated identical reads.

3. **Patch extraction and normalization**
   - Review the current diff extraction pipeline
     (`src/browser/diffExtractor.ts` + `scripts/copilot-code-review.ts`).
   - Design a small normalization layer that:
     - Accepts patch-like formats such as `*** Begin Patch` / `*** Update File`
       or ` ```patch ` fences from Copilot,
     - Synthesizes a proper git unified diff (`diff --git`, numeric hunks) that
       can be checked with `git apply --check`,
     - Keeps strict path safety guarantees (no absolute paths, no `../` out of
       repo, etc.).

4. **Contract alignment**
   - Ensure the behavior matches `docs/CONTRACT.md`:
     - Oracle parses the generated markdown (clarifying questions + patches),
       normalizes diffs, and only applies hunks it concurs with.
     - The raw Copilot reply is not required to be a perfect `git apply`
       patch, but Oracle’s synthesized diff must be.

## Constraints for the patch

- **Output format:** Unified diff only, inline inside a single fenced code block.
- Include a one-line commit subject on the first line of the patch.
- Hunk headers must be numeric only (`@@ -old,+new @@`); no symbolic headers.
- Patches must apply cleanly on the current branch of this repo.
- Do not introduce new dependencies or change build tooling.
- Keep changes minimal and focused on:
  - Stabilization heuristics,
  - Timeout/fallback behavior,
  - Diff extraction/normalization and contract alignment.
- No extra commentary, hosted links, or PR creation in the output.

## Acceptance criteria

- When running the Copilot code-review POC (e.g., with the latest smoke test):
  - `waitForCopilotResponse` logs both `"Copilot snapshot stabilized"` and
    `"Copilot response complete ✓"` for successful replies.
  - The script returns well before the 10-minute timeout for normal-length
    Copilot responses.
- For responses like the current `tmp/copilot-review-latest.log`:
  - Oracle extracts a patch-like block,
  - Normalizes it into a valid git unified diff,
  - Writes `tmp/copilot-review-turn-1.patch` (or similar),
  - And (when apply mode is `check`/`apply`) validates / applies it correctly.
- Browser engine behavior for non-Copilot ChatGPT flows remains unchanged.

## Test plan

1. Reproduce the hanging behavior with the current code:
   ```bash
   export CHROME_PROFILE_DIR="$HOME/.oracle/chrome-profile"
   export CHROME_PATH="/usr/bin/google-chrome"
   pnpm tsx scripts/copilot-code-review.ts --model gpt-5-pro --max-turns 1 --apply-mode none tmp/COPILOT_REVIEW_SMOKE.md
   ```
2. Capture the resulting log and confirm that:
   - Copilot clearly produced a full answer + patch,
   - Oracle did not log `"Copilot response complete ✓"` in time.
3. Apply Copilot’s proposed patch from this review and re-run the same command.
4. Verify that:
   - `waitForCopilotResponse` returns promptly and logs stabilization + complete,
   - A normalized unified diff is written under `tmp/copilot-review-turn-*.patch`,
   - (Optionally) switching to `--apply-mode check` validates the patch cleanly.
5. Run a non-Copilot ChatGPT browser run to confirm we haven’t regressed other
   browser flows.

## Clarifying questions

1. Are you comfortable with a heuristic “fallback after N seconds / snapshots”
   approach, where we switch to a simpler definition of “response complete”
   once Copilot has clearly produced a long answer?
2. Do you want the diff normalization layer to be Copilot-specific, or should
   it be shared for all browser targets that can emit `*** Begin Patch` style
   blocks (e.g., ChatGPT as well)?
3. Should Oracle ever treat a partially parsed patch (e.g., multiple files but
   only some convertible to unified diff) as `partial` with a non-zero status,
   or is it preferable to treat those cases as `invalid_diff` and avoid making
   any changes?

## Deliverable

Your entire reply MUST be a single markdown document with **exactly two
sections in this order**:

1. `## Patch`
   - Immediately under this heading, include **one** fenced ` ```diff` code
     block containing the unified diff that meets the constraints above
     (you may include multiple file hunks inside that single block).
   - Do **not** include any other text before or after the code block in
     this section.

2. `## Clarifying answers`
   - Under this heading, provide your answers to Clarifying questions 1–3 as
     a short markdown list or numbered list.
   - Do **not** include any additional commentary, links, or patch content
     in this section.

Additional rules:

- Do **not** ask me to paste file contents, push branches, or share permalinks;
  you already have access to the repository `grahama1970/oracle` on branch
  `feat/copilot-auth-review` and the paths of interest listed above.
- Do **not** add any text before `## Patch` or after `## Clarifying answers`.
- Do **not** emit more than one ` ```diff` block.

