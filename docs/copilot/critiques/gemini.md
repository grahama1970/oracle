# Critique of Copilot Quickstart & Integration Docs

## 1. CRITICAL: Auth validation script path mismatch blocks first use
*   **Location:** `QUICKSTART.md` line ~15
*   **Issue:** The quickstart references `tmp/validate-auth-enhanced.ts` but the workspace structure shows no such file (likely `scripts/authenticate-github-enhanced.ts` or similar). New users will fail immediately.
*   **Fix:** Verify the correct auth validation script path and update the quickstart command.

## 2. HIGH: Missing "ensure branch is pushed" command in agent workflow
*   **Location:** `QUICKSTART.md` "Project Agent with Human prompt" section
*   **Issue:** The text says "Make sure the branch with your changes is committed and pushed" but provides no concrete command. Agents acting on human prompts won't know whether to run `git push`, check remote status, or validate push success.
*   **Fix:** Add explicit verification commands: `git fetch origin && git rev-parse --abbrev-ref HEAD && git diff origin/$(git branch --show-current) --quiet || echo "ERROR: unpushed commits"`

## 3. HIGH: No concrete success/failure JSON examples in INTEGRATION-PYTHON.md
*   **Location:** `INTEGRATION-PYTHON.md`
*   **Issue:** While one success example is shown, there are no examples for `diff_missing`, `timeout`, `error`, `secret_detected`, or `apply_failed` states. Autonomous agents won't know what fields to check or what retry logic to implement.
*   **Fix:** Add a "JSON Examples by Status" section with 4–5 sample outputs showing actual field values agents should expect.

## 4. MEDIUM: Template instructions contradict autonomous agent workflow
*   **Location:** `templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md` vs. `QUICKSTART.md` autonomous section
*   **Issue:** The template requires manual "push the branch" steps, but the autonomous agent section never mentions branch validation or how to abort if the branch isn't pushed.
*   **Fix:** In `QUICKSTART.md` autonomous section, add explicit guardrail: "Before invoking the CLI, verify the target branch exists on the remote: `git ls-remote --heads origin <branch> || abort`."

## 5. MEDIUM: Ambiguous "model chip" verification for autonomous agents
*   **Location:** `QUICKSTART.md` autonomous guardrails
*   **Issue:** Says "ensure logs show model chip GPT‑5; abort/retry if mismatched" but doesn't specify which log file, what the exact string looks like, or how to programmatically check it.
*   **Fix:** Add concrete check: "Parse `tmp/copilot-review-*.log` for line containing `Model chip: GPT-5` (case-sensitive). If absent or different model name found, abort."

## 6. MEDIUM: Timeout value inconsistency across docs
*   **Location:** `QUICKSTART.md` vs `INTEGRATION-PYTHON.md`
*   **Issue:** `QUICKSTART.md` uses `--timeout-ms 180000` (3 min), but `INTEGRATION-PYTHON.md` example omits it. Downstream integrators may experience indefinite hangs.
*   **Fix:** Add `--timeout-ms 180000` to the Python example command list and note in a comment.

## 7. MEDIUM: Missing abort condition for auth validation failures
*   **Location:** `QUICKSTART.md` autonomous section
*   **Issue:** Says "abort if not ready (non-zero exit)" but doesn't clarify what non-zero codes mean or how to surface the error to the human.
*   **Fix:** Add: "If auth validator exits non-zero, read its stderr, log the error (`Copilot auth failed: <reason>`), and return control to human immediately."

## 8. LOW: Python integration snippet has incomplete imports
*   **Location:** `INTEGRATION-PYTHON.md`
*   **Issue:** Snippet imports `pathlib`, `subprocess`, `sys`, `json` but then references `os.environ` without importing `os`.
*   **Fix:** Add `import os` to the import block.
