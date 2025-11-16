# Oracle Contract (Copilot / Browser Transport)

This document is the single source of truth for how this Oracle fork is expected to behave when other project agents use it as a **browser‑based transport** to Copilot Web (and similar UIs), and what guarantees those agents can rely on. Treat this as an executable spec: CLI flags, exit codes, and JSON outputs are expected to match this contract.

---

## 1. Scope & Roles

- **Scope**
  - Oracle is a **transport agent**: it takes a fully‑assembled code review or patch request from a project agent, delivers it to an LLM UI (ChatGPT, Copilot Web, etc.), and returns the response in a machine‑readable form.
  - This fork focuses on **browser engine** runs, especially Copilot Web review requests that originate from other agents.
  - API engine behavior (`openai` Responses) remains unchanged and is out of scope for this document except where explicitly noted.

- **Roles**
  - **Project agents (per‑repo) MUST:**
    - Decide what code, diffs, and context to include.
    - Construct the review or patch request text (often using a template like `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`).
    - Choose the desired engine (`--engine api|browser`) and target UI (`--browser-url`, or a future `--copilot` convenience flag).
    - Decide whether patches should be applied/committed or only emitted.
  - **Oracle MUST:**
    - Assemble the final prompt + files bundle and deliver it to the target UI.
    - Capture the assistant response (text/HTML) and, when requested, extract unified diffs.
    - Persist logs and JSON artifacts under `~/.oracle/sessions/<slug>`.
    - Respect apply modes and safety flags documented below.
    - For this fork’s Copilot workflow, perform `git` commit + push via the repo’s helper when instructed to apply diffs, so project agents do not have to perform those steps by hand.

---

## 2. Engines & Targets

- **Engines**
  - `--engine api` → OpenAI Responses API (default when `OPENAI_API_KEY` is set).
  - `--engine browser` → Chrome automation to a web UI (ChatGPT by default).
  - If `--engine` is omitted:
    - Oracle chooses `api` when `OPENAI_API_KEY` is present.
    - Otherwise, Oracle chooses `browser`.

- **Targets**
  - Default browser target: `https://chatgpt.com/`.
  - `--browser-url <url-or-host>` MUST:
    - Accept full URLs (`https://chatgpt.com/`, `https://github.com/copilot/`, `https://gemini.google.com/app`).
    - Accept bare hosts/paths (`chatgpt.com`, `github.com/copilot`, `gemini.google.com/app`) and normalize them to `https://<value-without-leading-slashes>`.
  - Future: a `--copilot` convenience flag MAY set `--browser-url https://github.com/copilot/` and select a Copilot‑specific DOM driver, but the diff/JSON/secret/git behavior stays identical.

---

## 3. Sessions, Slugs & Artifacts

- **Sessions**
  - Every non‑preview run (API or browser) MUST create a session under:
    - `ORACLE_HOME_DIR` (default `~/.oracle`),
    - `~/.oracle/sessions/<slug>/`.
  - `--slug "<3–5 words>"` overrides the slug; otherwise Oracle derives one from the prompt.
  - `session.json` MUST store:
    - `id`, `createdAt`, `status`, `promptPreview`, `model`, `cwd`, `mode` (`api|browser`),
    - Stored run options (prompt, files, model, engine‑specific config),
    - Usage (`inputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`) when available.

- **Artifacts**
  - For browser diff runs, Oracle MUST create (paths default to the session dir, overridable via CLI flags):
    - `diff.patch` (or as specified by `--diff-output`),
    - `result.json` (or as specified by `--json-output`),
    - `metrics.json` (or as specified by `--metrics-output`),
    - `output.log` (append‑only log stream for the run).
  - If DOM snapshots are enabled (`--dom-snapshot <ms>`), the browser engine SHOULD write `snapshot-XXX.html` files into the session directory.

---

## 4. Diff Automation Contract (Browser Engine)

When a project agent opts into diff automation, Oracle MUST obey the following behavior:

- **Opt‑in**
  - Diff extraction and git operations MUST be treated as **opt‑in**. They are active when any of the following is true:
    - `--emit-diff-only` is set, or
    - Any of `--diff-output`, `--apply-mode`, `--strict-diff`, `--retry-if-no-diff` is present.
  - Non‑diff browser runs SHOULD remain as close as possible to “simple prompt → answer” behavior.

- **Extraction**
  - Oracle MUST:
    - Scan the assistant answer for fenced blocks (```…```), including tags like `diff`, `patch`, or multi‑word tags.
    - Score candidate blocks with heuristics favoring:
      - Presence of `diff --git`,
      - Presence of numeric hunk headers `@@ -<old>,<count> +<new>,<count> @@`,
      - Starting with `diff --git`,
      - Reasonable size (prefer blocks with > ~200 chars).
    - Select the highest‑scoring block and record:
      - `diffScore` (score of the selected block),
      - `diffBlocks` (number of candidate blocks),
      - `diffReason` when no block is selected (e.g., `no_fenced_blocks`, `partial_fence`).

- **Validation**
  - At minimum, any selected diff MUST:
    - Contain at least one `diff --git a/... b/...` header.
    - Contain at least one numeric hunk header.
  - When `--strict-diff` is set, Oracle MUST also:
    - Require that each `diff --git` header parses into `aPath` and `bPath`.
    - Reject any path that is:
      - Absolute (`/...`),
      - Contains `../` traversal,
      - Starts with a Windows drive prefix (`C:\...`),
    - Require at least one `--- a/...` or `+++ b/...` header.
    - Enforce numeric hunk header shape for every `@@ ... @@` line.

- **Path restriction**
  - When `--restrict-path-prefix <dir>` is provided, Oracle MUST:
    - Normalize paths (convert `\` to `/`, trim trailing `/`).
    - Reject patches where any `a/...` or `b/...` path in `diff --git` falls outside the given prefix.

- **Retry behavior**
  - With `--retry-if-no-diff`:
    - If no valid diff is found or the diff is malformed (based on the above checks), Oracle MAY issue a follow‑up prompt (either default or from `--followup-prompt`) and try again up to `--max-retries`.
    - Oracle MUST track `retryCount` and include it in `result.json`.

---

## 5. Git Apply / Commit Behavior

When `--apply-mode` is used, Oracle MUST respect the following rules:

- **Modes**
  - `none`: do not run git at all; only emit `diff.patch` and JSON.
  - `check`: run `git apply --check diff.patch`; do not modify the working tree.
  - `apply`: validate then run `git apply diff.patch`; do not commit.
  - `commit`: validate, apply, and commit.

- **Repository validation**
  - `--git-root <path>` MUST point at a valid Git repository (a `.git` directory must exist there).
  - When `--git-root` is set and `--apply-mode != none`, Oracle MUST:
    - Verify that `.git` exists, otherwise fail with a clear error.

- **Commit semantics**
  - For `apply-mode=commit`, Oracle MUST:
    - Stage all changes with `git add -A`,
    - Commit with `git commit -m "<message>"` (message from `--commit-message` or a safe default).
  - If `git add -A` fails, Oracle MUST:
    - Treat the operation as `commit_failed`,
    - Capture and surface `gitCommitError` in `result.json`.
  - If commit fails after a successful apply, Oracle MUST:
    - Set `status = "commit_failed"`,
    - Keep `diffApplied = false` in JSON, indicating that the patch is not yet safely recorded in history (project agents can decide how to handle this).

- **Diagnostics**
  - `result.json` MUST include:
    - `status`: `success`, `diff_missing`, `invalid_diff`, `partial`, `secret_detected`, `apply_failed`, `commit_failed`, `timeout`, `error`, or similar.
    - `diffFound`, `diffValidated`, `diffApplied`,
    - `applyMode`, `branch`, `commitSha` (if commit succeeded),
    - `gitApplyError`, `gitCommitError` (stderr strings when git steps fail).

- **Commit/push as part of this fork’s workflow**
  - For this fork, when a project agent instructs Oracle to accept Copilot’s diffs and apply them, Oracle SHOULD:
    - Use the repo’s `scripts/committer` helper to create the commit locally (to match human workflows and guardrails), and
    - Push the current branch to its upstream remote, so Copilot can see the updated code without additional human steps.

---

## 6. Secret Scanning & Sanitization

- **Scan scope**
  - Before sending prompts to a browser UI, Oracle MUST be able to:
    - Scan prompt text for a set of known secret patterns (AWS keys, bearer tokens, GitHub tokens, Google API keys, Slack tokens, Stripe keys, OpenAI keys, JWT‑like tokens, etc.).
    - Return a list of detected patterns and short identifiers (not full values).

- **Behavior**
  - `--sanitize-prompt`:
    - Oracle MUST redact detected secrets from the prompt text (replacing them with `***REDACTED***`) before sending it to the browser.
  - `--secret-scan`:
    - If any matches are found, Oracle MUST abort the run early with `status = "secret_detected"`, write a `result.json` with this status, and avoid sending the prompt to the UI.

- **Reporting**
  - `result.json` MUST include a `secretScan` object:
    - `status`: `"ok"` or `"matches_detected"`,
    - `matches`: an array of labels (e.g., `["openai_api_key", "github_token"]`).

---

## 7. JSON Contract for Project Agents

For browser diff runs, `result.json` MUST be sufficient for a project agent to decide what to do next.

At minimum it MUST contain:

- `status`: overall outcome (see list above).
- `diffFound`: boolean.
- `diffValidated`: boolean.
- `diffApplied`: boolean.
- `applyMode`: `none|check|apply|commit`.
- `branch`: string or null.
- `commitSha`: string or null (when commit succeeded).
- `retryCount`: integer.
- `elapsedMs`: integer.
- `promptChars`, `responseChars`: integers.
- `patchBytes`: integer (size of `diff.patch` in bytes).
- `diffPath`: full path to the diff file or null.
- `secretScan`: as described above.
- Optional diagnostics:
  - `diffScore`, `diffBlocks`, `diffReason`,
  - `gitApplyError`, `gitCommitError`,
  - `snapshots`: list of snapshot file paths.

Project agents MAY:

- Treat `status === "success" && diffFound === true` as “diff ready; proceed to tests.”
- Treat `status` in `{ "diff_missing", "invalid_diff", "partial" }` as “retry or escalate.”
- Treat `"secret_detected"`, `"apply_failed"`, `"commit_failed"` as “operator attention required,” using the error fields for triage.

---

## 8. Exit Codes

For inline runs (`ORACLE_NO_DETACH=1`), Oracle SHOULD map browser diff statuses to process exit codes so agents can use shell logic:

- `0` → `success`
- `2` → `diff_missing`, `invalid_diff`, or `partial`
- `3` → `secret_detected`
- `4` → `apply_failed`
- `5` → `commit_failed`
- `6` → `timeout`
- `1` → any other error

Detached/background runs continue to rely on `result.json` and `session.json` instead of exit codes.

---

## 9. Responsibilities Recap

- **Project agents**
  - Construct review/patch requests (usually via templates).
  - Decide which engine and target UI to use.
  - Decide whether and how to apply patches based on `result.json`.

- **Oracle (this fork)**
  - Reliably deliver prompts + files to the chosen UI (ChatGPT, Copilot, etc.).
  - Capture responses and, when requested, extract, validate, and optionally apply/commit diffs.
  - Manage sessions, logs, JSON artifacts, and exit codes according to this contract.
  - For the Copilot‑centric workflow, own the end‑to‑end automation for:
    - Assembled review request → Copilot Web → response,
    - Applying accepted diffs via git,
    - Committing and pushing via `scripts/committer` so humans do not need to perform those steps manually.
