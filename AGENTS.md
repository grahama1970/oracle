# Agent Instructions

This repository relies on autonomous agents to run the `oracle` CLI safely. When you update the runner or CLI behavior, add a short note here so future agents inherit the latest expectations. These guidelines supplement the existing system/developer instructions.

## Current Expectations

- When a user pastes a CLI command that is failing and you implement a fix, only execute that command yourself as the *final* verification step. (Skip the rerun entirely if the command would be destructive or dangerous—ask the user instead.)
- Browser runs now exist (`oracle --browser`). They spin up a Chrome helper process, log its PID in the session output, and shouldn't be combined with `--preview`. If you modify this flow, keep `docs/browser-mode.md` updated.
- Browser mode inherits the `--model` flag as its picker target—pass strings like `--model "ChatGPT 5.1 Instant"` to hit UI-only variants; canonical API names still map to their default labels automatically. Cookie sync now defaults to Chrome's `"Default"` profile so you stay signed in unless you override it, and the run aborts if cookie copying fails (use the hidden `--browser-allow-cookie-errors` override only when you truly want to proceed logged out).
- **Always ask before changing tooling** – package installs, `pnpm approve-builds`, or swaps like `sqlite3` → `@vscode/sqlite3` require explicit user confirmation. Suggest the change and wait for approval before touching dependencies or system-wide configs.
- **Interactive prompts** – when you must run an interactive command (e.g., `pnpm approve-builds`, `git rebase --interactive`), start a `tmux` session first (`tmux new -s oracle`) so the UI survives and the user can attach if needed.
