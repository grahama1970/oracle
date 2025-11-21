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
    - Ensure the code to be reviewed exists in a **pushed feature branch** that Copilot can see:
      - If working on `main` or on an untracked workspace, first create a feature branch, commit the relevant changes locally, and push that branch to the Git remote.
      - Include the GitHub repo (`owner/repo`) and branch name explicitly in the review request so Copilot can resolve file paths against the correct branch.
    - Construct the review or patch request text (often using a template like `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`) and keep its “Repo / Branch” section in sync with the pushed feature branch.
    - Choose the desired engine (`--engine api|browser`) and target UI (`--browser-url`, or a future `--copilot` convenience flag).
    - Decide whether patches should be applied/committed or only emitted.
  - **Oracle MUST:**
    - Assemble the final prompt + files bundle and deliver it to the target UI.
    - Capture the assistant response (text/HTML) and, when requested, extract unified diffs.
    - Persist logs and JSON artifacts under `~/.oracle/sessions/<slug>`.
    - Respect apply modes and safety flags documented below.
    - For this fork’s Copilot workflow, perform `git` commit + push via the repo’s helper when instructed to apply diffs, so project agents do not have to perform those steps by hand.

### Interaction Patterns: Legacy Copy/Paste vs Browser Transport

- **Legacy (human copy/paste) flow**
  - A human or project agent:
    - Runs `oracle` (or a repo script) to assemble a review request.
    - Manually pastes that request into Copilot / ChatGPT in a browser tab.
    - Copies the assistant’s markdown reply (answers + unified diff) back into an agent chat (e.g., this Codex CLI) for interpretation.
  - The agent:
    - Reads the pasted markdown,
    - Decides which hunks to accept,
    - Tells the human which patch to apply or emits a patch file for them.

- **New (Oracle‑mediated) browser transport**
  - Oracle now owns the browser interaction and eliminates manual copy/paste:
    - Project agents still construct the request (often via `COPILOT_REVIEW_REQUEST_EXAMPLE.md` or a repo‑specific template).
    - Oracle (or a helper script such as `scripts/copilot-code-review.ts`) launches Chrome headless, navigates to Copilot Web, pastes the prompt, and waits for the response.
    - Oracle reads the assistant’s markdown directly from the DOM, extracts the best unified diff, and writes it to patch files (e.g., `tmp/copilot-review-turn-1.patch`) and JSON artifacts.
  - The human’s role is now limited to:
    - Kicking off the command and, when needed, approving GitHub 2FA/passkeys,
    - Reviewing Oracle’s summary/patch application decisions,
    - Overriding or re‑running sessions if they disagree.
  - No human copy/paste between Copilot and Oracle is required in the new flow; Oracle is responsible for faithfully mirroring the assistant’s markdown into machine‑readable artifacts and applying diffs according to this contract.

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

## 3. Authentication (GitHub / Copilot Web)

- **Goal**
  - Oracle’s browser engine MUST run against a browser profile that is already authenticated to GitHub so that `https://github.com/copilot/` loads the Copilot UI, not the marketing/sign‑in page.

- **Paved path (Kimi auth flow)**
  - This fork uses a dedicated Playwright+TOTP authentication helper as the canonical way to establish and refresh a Copilot session:
    - `scripts/authenticate-github-enhanced.ts` (Playwright + `otplib`):
      - Logs in to GitHub (username/password), or validates an existing authenticated Chrome profile,
      - Handles time‑based one‑time passwords (2FA) when `GITHUB_TOTP_SECRET` is set,
      - Navigates to Copilot and verifies access,
      - Persists the session in a Chrome profile suitable for reuse.
    - `tmp/validate-auth-enhanced.ts`:
      - Validates that the chosen profile session:
        - Is authenticated to GitHub, and
        - Reaches the Copilot chat UI (not just the marketing/sign‑in page).
    - Both scripts MUST load credentials from environment variables (either exported in the shell or provided via a `.env` file in this repo). At minimum:
      - `GITHUB_USERNAME` — your GitHub username.
      - `GITHUB_PASSWORD` — your GitHub password.
      - `GITHUB_TOTP_SECRET` — optional Base32 TOTP secret for 2FA.
      - `CHROME_PATH` — optional path to the Chrome/Chromium binary (defaults to `/usr/bin/google-chrome`).
      - `CHROME_PROFILE_DIR` — optional Chrome profile directory; when set to an existing logged‑in profile (e.g. `~/.config/google-chrome/Default`), the auth script SHOULD prefer validating that session instead of forcing a fresh login.

- **Requirements**
  - Before relying on Copilot Web in unattended runs, a project operator MUST:
    - Run the enhanced auth helper once in a GUI or virtual display context (e.g., `xvfb-run` for headless CI) to establish a GitHub+Copilot session using the configured credentials.
    - Use the validation helper to confirm the session is usable.
  - Oracle’s browser engine MUST:
    - Use the authenticated profile (as configured) when launching Chrome for Copilot runs.
    - Avoid relying solely on raw cookie copying for GitHub auth; cookie sync may be used as a best‑effort helper, but the Playwright flow is the source of truth for establishing sessions.

---

## 4. Sessions, Slugs & Artifacts

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

## 5. Diff Automation Contract (Browser Engine)

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
  - At minimum, any selected diff (after Oracle has normalized the assistant’s markdown into a canonical patch form) MUST:
    - Contain at least one `diff --git a/... b/...` header.
  - The raw browser UI response is **not** required to be a deterministic `git apply` patch:
    - Oracle MAY parse patch‑like formats (e.g., `*** Begin Patch` / `*** Update File` blocks, or ` ```patch ` fences) from the generated markdown and synthesize a unified diff that satisfies the above constraints before validation and application.
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

### Copilot response completion & capture (browser engine)

- **Completion signals** — For Copilot runs, Oracle MUST declare the response complete only after combining these signals:
  - Stop/Spinner controls have disappeared.
  - Send button is enabled.
  - Assistant markdown has stayed stable for a small, configurable number of poll cycles.
  - A MutationObserver or inactivity check confirms no recent mutations in the assistant message container.
- **Timeouts** — Default wall‑clock timeout SHOULD be ~90 s. If that limit is reached while some content exists, Oracle MUST return a partial outcome (e.g., `timeout_partial`) and record the completion path (e.g., `all_signals`, `inactivity_fallback`, `forced_timeout`).
- **Assistant‑scoped capture** — Patch/source extraction MUST scope to the latest assistant turn inside the Copilot conversation container, preferring the per‑turn “Copy” control. DOM fallbacks MUST clone and sanitize the assistant node, removing navigation, sidebar, or tool UI before reading text/HTML.
- **Sidebar bleed guard** — When sidebar/navigation indicators are detected in the captured source, diff extraction MUST treat the source as contaminated and surface `diff_missing`/`invalid_diff` with a reason such as `sidebar_bleed_detected` instead of emitting a bogus patch.
- **Observability** — `result.json` SHOULD include `completionPath` (labeling which completion path fired) and a lightweight `copilotSignals`/`metrics` object (e.g., send/stop/spinner flags, stable cycle counts, elapsed ms, whether clipboard or DOM fallback was used) to aid drift debugging.

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
- Optional Copilot diagnostics (when `platform === "copilot"`):
  - `completionPath`: string label for the completion path used (e.g., `all_signals`, `inactivity_fallback`, `forced_timeout`, `timeout_partial`).
  - `copilotSignals`/`metrics`: object summarizing completion signals (send/stop/spinner flags, stable cycle counts, elapsed ms, clipboard vs DOM extraction).
  - `sidebarDetected`: boolean when sidebar/navigation content was detected in `patchSource` and the diff was rejected.
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
  - Capture responses and, when requested, parse the generated markdown (including clarifying questions and any patch‑like blocks), then extract, normalize, validate, and optionally apply/commit diffs that Oracle concurs with.
  - Manage sessions, logs, JSON artifacts, and exit codes according to this contract.
  - For the Copilot‑centric workflow, own the end‑to‑end automation for:
    - Assembled review request → Copilot Web → response,
    - Applying accepted diffs via git,
    - Committing and pushing via `scripts/committer` so humans do not need to perform those steps manually.
   - When Copilot returns unified diffs:
     - Thoroughly read the response, decide which hunks are safe and appropriate, and apply only those diffs locally (never blindly apply everything).
     - When the response is ambiguous or incomplete, run additional **browser rounds** with Copilot (by issuing follow‑up prompts derived from the same review context) to clarify intent or request corrections, then re‑evaluate and apply diffs as above.
     - Respect the configured **max‑turns** limit (see below) when deciding how many follow‑ups to issue.

---

## 7. Copilot Review Rounds & max‑turns

- **Round orchestration**
  - Oracle MAY act as an “interaction agent” on top of the browser transport for Copilot review requests.
  - In this mode, Oracle:
    1. **Create code review request** – assemble a review prompt from a template (e.g. `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md` or a repo‑specific variant such as `tmp/COPILOT_REVIEW_AUTH_SYSTEM.md`).
    2. **Send to Copilot and await response** – deliver the prompt to Copilot Web via the browser engine (main `oracle` CLI with `--engine browser --copilot` or helper script such as `scripts/copilot-code-review.ts`) and wait for Copilot’s markdown reply, persisting it as a generated markdown artifact for downstream agents.
    3. **Read Copilot response and apply agreed‑upon diffs** – thoroughly read the persisted markdown response (clarifying questions + patch proposals), parse any unified‑diff‑like or patch‑style blocks, normalize them into a canonical unified diff, and apply only those hunks that Oracle “concurs with” (correct paths, matches intent, passes validation).
    4. **Ask clarifying questions if needed** – when the response is ambiguous, incomplete, or missing diffs, send a follow‑up list of clarifying questions back to Copilot within the same session and await the new response.
    5. **Read follow‑up response and adjust code** – thoroughly read the follow‑up, extract and validate any new diffs, and make additional code changes when they are necessary and relevant for the requested review.

- **max‑turns parameter**
  - Browser‑driven Copilot review sessions MUST respect a configurable turn limit:
    - Default limit: **3** turns (1 initial request + up to 2 follow‑ups) unless overridden.
    - CLI integrations SHOULD expose a flag such as `--copilot-max-turns <n>` (and helper scripts MAY accept `--max-turns <n>`) to allow project agents to raise or lower this cap.
  - Oracle MUST:
    - Track how many Copilot prompts have been sent for a given review session.
    - Stop issuing new follow‑ups once the max‑turns limit is reached, even if further clarification would be useful.
    - Surface in logs/session JSON how many turns were used and whether the limit was hit.

- **Model selection in Copilot rounds**
  - The existing `--model` flag continues to control which GPT‑5 family model Oracle aims at, even for Copilot:
    - `--model gpt-5.1` SHOULD target the **“GPT‑5”** picker entry in the ChatGPT/Copilot UI.
    - `--model gpt-5-pro` SHOULD target **“GPT‑5 Pro”** when available.
    - Descriptive labels (e.g. `--model "GPT-5 Instant"`) MAY be passed through as explicit overrides when the UI exposes such variants.
  - Helper scripts (e.g. `scripts/copilot-code-review.ts`) SHOULD accept a `--model <name>` argument and map it to the appropriate browser model label so that Copilot review rounds run against the intended GPT‑5 variant.
