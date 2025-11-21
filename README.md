# oracle 🧿 — Whispering your tokens to the silicon sage

<p align="center">
  <img src="./README-header.png" alt="Oracle CLI header banner" width="1100">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@steipete/oracle"><img src="https://img.shields.io/npm/v/@steipete/oracle?style=for-the-badge&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://github.com/steipete/oracle/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/steipete/oracle/ci.yml?branch=main&style=for-the-badge&label=tests" alt="CI Status"></a>
  <a href="https://github.com/steipete/oracle"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platforms"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

Oracle gives your agents a simple, reliable way to **bundle a prompt plus the right files and hand them to another AI**. It currently speaks GPT-5.1 and GPT-5 Pro; Pro runs can take up to ten minutes and often return remarkably strong answers.

## Two engines, one CLI

- **API engine** — Calls the OpenAI Responses API. Needs `OPENAI_API_KEY`.
- **Browser engine** — Automates a web UI (ChatGPT by default) in Chrome so you can use your Pro account directly. Toggle with `--engine browser`; no API key required. You can override the target URL via `--browser-url`, e.g.:

  ```bash
  # Default ChatGPT
  oracle --engine browser --prompt "Summarize the risk register"

  # Explicit host or full URL
  oracle --engine browser --browser-url chatgpt.com --prompt "Summarize the risk register"
  oracle --engine browser --browser-url https://github.com/copilot/ --prompt "Review this diff"
  oracle --engine browser --browser-url gemini.google.com/app --prompt "Summarize the risk register"
  ```

If you omit `--engine`, Oracle prefers the API engine when `OPENAI_API_KEY` is present; otherwise it falls back to browser mode. Switch explicitly with `-e, --engine {api|browser}` when you want to override the auto choice. Everything else (prompt assembly, file handling, session logging) stays the same.

### GitHub Copilot authentication (this fork)

For Copilot browser runs against `https://github.com/copilot/`, this fork expects a Chrome profile that is already authenticated to GitHub. The canonical path uses Playwright + TOTP:

```bash
# 1) Configure credentials (either export in your shell or put them in .env)
export GITHUB_USERNAME="your-username"
export GITHUB_PASSWORD="your-password"
export GITHUB_TOTP_SECRET="base32-totp-secret"   # optional, for 2FA
export CHROME_PATH="/usr/bin/google-chrome"      # optional override

# Optional: point at an existing logged-in Chrome profile instead of a fresh one
# e.g. CHROME_PROFILE_DIR="$HOME/.config/google-chrome/Default"
export CHROME_PROFILE_DIR="$HOME/.config/google-chrome/Default"

# 2) Establish a session (headless via virtual display, or headful if you have a GUI)
xvfb-run -a pnpm tsx scripts/authenticate-github-enhanced.ts --headless

# 3) Validate that Copilot chat is reachable, not just the marketing/auth page
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
```

By default, the enhanced auth script persists the session under `~/.oracle/chrome-profile`. Example usage with the browser engine:

```bash
pnpm tsx scripts/use-authenticated-copilot.ts auth
```

The browser engine and Copilot POC scripts will then reuse that authenticated profile when targeting `https://github.com/copilot/`.

### Copilot quickstart (browser)

- One-pager: `docs/copilot/QUICKSTART.md` (includes copy/paste commands).
- Prompt template: `docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`.
- Run the template via Oracle (browser engine, single turn):
  ```bash
  ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts \
    docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md \
    --apply-mode none --model gpt-5
  ```
- Bash helper wrapper (uses the same template by default):
  ```bash
  bash docs/copilot/tests/use-copilot.sh
  ```

## Quick start

```bash
# One-off (no install)
OPENAI_API_KEY=sk-... npx -y @steipete/oracle -p "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

# Browser engine (no API key)
npx -y @steipete/oracle --engine browser -p "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md

In this fork, the long‑term goal is for a Codex‑style agent to assemble a **code review prompt** using a template like `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md` and then drive a Copilot review run directly against `https://github.com/copilot/` instead of `https://chatgpt.com/`.

The intended future UX for that flow looks roughly like:

```bash
npx -y @steipete/oracle --engine browser --copilot docs/templates/COPILOT_CODE_REVIEW.md
```

That `--copilot` flag is not implemented yet; it is reserved here to document the desired direction for this fork (GitHub Copilot‑optimized browser runs using structured review request templates).

# Globs/exclusions
npx -y @steipete/oracle -p "Review the TS data layer" --file "src/**/*.ts" --file "!src/**/*.test.ts"

# Mixed glob + single file
npx -y @steipete/oracle -p "Audit data layer" --file "src/**/*.ts" --file README.md

# Inspect past sessions
oracle status --clear --hours 168   # prune a week of cached runs
oracle status                       # list runs; grab an ID
oracle session <id>                 # replay a run locally
```

## How do I integrate this?

- **One-liner in CI** — `OPENAI_API_KEY=sk-... npx -y @steipete/oracle --prompt "Smoke-check latest PR" --file src/ docs/ --preview summary` (add to your pipeline as a non-blocking report step).
- **Package script** — In `package.json`: `"oracle": "oracle --prompt \"Review the diff\" --file ."` then run `OPENAI_API_KEY=... pnpm oracle`.

## Highlights

- **Bundle once, reuse anywhere** — Prompt + files become a markdown package the model can cite.
- **Flexible file selection** — Glob patterns and `!` excludes let you scoop up or skip files without scripting.
- **Pro-friendly** — GPT-5 Pro background runs stay alive for ~10 minutes with reconnection + token/cost tracking.
- **Two paths, one UX** — API or browser, same flags and session logs.
- **Search on by default** — The model can ground answers with fresh citations.
- **File safety** — Per-file token accounting and size guards; `--files-report` shows exactly what you’re sending.
- **Readable previews** — `--preview` / `--render-markdown` let you inspect the bundle before spending.

## Flags you’ll actually use

| Flag | Purpose |
| --- | --- |
| `-p, --prompt <text>` | Required prompt. |
| `-f, --file <paths...>` | Attach files/dirs (supports globs and `!` excludes). |
| `-e, --engine <api|browser>` | Choose API or browser automation. Omitted: API when `OPENAI_API_KEY` is set, otherwise browser. |
| `-m, --model <name>` | `gpt-5-pro` (default) or `gpt-5.1`. |
| `--files-report` | Print per-file token usage. |
| `--preview [summary|json|full]` | Inspect the request without sending. |
| `--render-markdown` | Print the assembled `[SYSTEM]/[USER]/[FILE]` bundle. |
| `-v, --verbose` | Extra logging (also surfaces advanced flags with `--help`). |

More knobs (`--max-input`, cookie sync controls for browser mode, etc.) live behind `oracle --help --verbose`.

## Copilot unified diff automation (browser engine)

When you run Oracle with `--engine browser`, you can ask ChatGPT/Copilot to return a **unified diff** and let Oracle extract, validate, and optionally apply that patch for you. This is designed for agents (or scripts) that want hands-free patch generation.

Core flags:

| Flag | Purpose |
| --- | --- |
| `--emit-diff-only` | Enable diff extraction mode for browser runs. |
| `--diff-output <path>` | Write the extracted unified diff to this path (defaults to the session directory). |
| `--json-output <path>` | Write a machine-readable JSON result summary (defaults to `result.json` in the session directory). |
| `--strict-diff` | Require a well-formed unified diff with numeric hunk headers. |
| `--retry-if-no-diff` | Retry once (or up to `--max-retries`) when no valid diff block is found. |
| `--apply-mode <none\|check\|apply\|commit>` | Control patch handling: just emit, validate only, apply to the working tree, or apply + commit. |
| `--git-root <path>` | Git repository root for patch validation/application (defaults to the current working directory). |
| `--branch <name>` | Record the intended target branch name in session metadata/JSON. |
| `--commit-message <text>` | Commit message when `--apply-mode=commit`. |
| `--exit-on-partial` | Treat truncated/partial diff fences as failures. |
| `--sanitize-prompt` | Redact common secret patterns in the browser prompt before sending it. |
| `--secret-scan` | Fail the run when secret-like data is detected in the prompt. |

Example end-to-end run:

```bash
oracle --engine browser \
  --prompt "$(cat spec.md)" \
  --slug fix-step06 \
  --emit-diff-only \
  --diff-output ./out/fix-step06.patch \
  --json-output ./out/fix-step06.json \
  --apply-mode apply \
  --branch fix/restore-pipeline-steps-20251031-073204 \
  --retry-if-no-diff --max-retries 1 --strict-diff
```

The JSON result includes a `status` field (`success`, `diff_missing`, `partial`, `secret_detected`, `apply_failed`, `commit_failed`, `timeout`, `error`, etc.), the path to the diff file, retry count, and basic metrics (elapsed time, prompt/response sizes, patch size). See `docs/INTEGRATION-PYTHON.md` for a Python-oriented integration guide.

## Sessions & background runs

Every non-preview run writes to `~/.oracle/sessions/<slug>` with usage, cost hints, and logs. Use `oracle status` to list sessions, `oracle session <id>` to replay, and `oracle status --clear --hours 168` to prune. Set `ORACLE_HOME_DIR` to relocate storage.

## Testing

```bash
pnpm test
pnpm test:coverage
```

---

If you’re looking for an even more powerful context-management tool, check out https://repoprompt.com

Name inspired by: https://ampcode.com/news/oracle
