# Browser Debug Checklist (ChatGPT / Copilot)

This repo already ships the tooling needed to inspect the live browser DOM.
Agents should use these steps instead of treating the DOM as opaque or relying
only on log snippets.

## 1. Launch a headful browser run

Prefer the main CLI wrapper so Chrome is started with DevTools enabled and
`--browser-keep-browser` so you can attach after Oracle finishes its work:

```bash
pnpm run oracle -- --engine browser --browser-keep-browser \
  --model "5.1 Instant" \
  --prompt "Debug browser DOM selectors."
```

For Copilot‑specific tests, you can also use the POC script directly:

```bash
export CHROME_PROFILE_DIR="$HOME/.oracle/chrome-profile"
export CHROME_PATH="/usr/bin/google-chrome"

pnpm tsx scripts/copilot-code-review.ts \
  --model gpt-5-pro \
  --max-turns 1 \
  --apply-mode none \
  tmp/COPILOT_REVIEW_SMOKE.md
```

In both cases Chrome runs **headful** and stays open, so you can inspect the
composer and conversation thread.

## 2. Discover Chrome ports and tabs

Use the local helper rather than generic MCP tools:

```bash
pnpm tsx scripts/browser-tools.ts inspect
```

You should see one or more Chrome PIDs and ports plus their tabs. For Copilot
debugging, look for lines like:

- `Tab 1: GitHub Copilot · GitHub`
- `https://github.com/copilot`

This confirms that `browser-tools.ts` can see the same Chrome instance that
Oracle launched.

## 3. Run DOM probes against the active tab

With the Copilot or ChatGPT tab active, use `eval` to check the selectors used
by `constants.ts` and the navigation/response helpers.

Examples (Copilot):

```bash
# Conversation scope exists?
pnpm tsx scripts/browser-tools.ts eval \
  'Boolean(document.querySelector("div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_"))'

# Fallback chat-thread?
pnpm tsx scripts/browser-tools.ts eval \
  'Boolean(document.querySelector("[data-testid=\\"chat-thread\\"]"))'

# Latest markdown body innerText preview
pnpm tsx scripts/browser-tools.ts eval \
  'document.querySelector("div.markdown-body[data-copilot-markdown]")?.innerText.slice(0, 500)'
```

For ChatGPT, probe the selectors from `ANSWER_SELECTORS`, `CONVERSATION_TURN_SELECTOR`,
and `ASSISTANT_ROLE_SELECTOR` instead.

If any of these checks return `false` or `null`, update the corresponding
selectors in `src/browser/constants.ts` and the associated helpers
(`waitForCopilotResponse`, `waitForAssistantResponse`) based on what you see
in DevTools.

## 4. Capture snapshots when debugging hangs

When `waitForCopilotResponse` or `waitForAssistantResponse` appears to hang:

1. Use `browser-tools.ts eval` to dump the latest assistant message body:

   ```bash
   pnpm tsx scripts/browser-tools.ts eval \
     'document.querySelector("article[data-testid^=\\"conversation-turn\\"][data-message-author-role=\\"assistant\\"] .markdown")?.innerText.slice(0, 800)'
   ```

2. If necessary, take a screenshot:

   ```bash
   pnpm tsx scripts/browser-tools.ts screenshot
   ```

3. Use these snapshots to adjust stabilization heuristics (e.g., stop button
visibility, text stability) rather than guessing from CLI logs alone.

## 5. When to stop

If you cannot confirm selectors via `browser-tools.ts eval` (for example,
because the run never reaches the target UI), stop and record:

- The exact command you ran,
- The last log lines from the CLI,
- Any DOM probes that returned `false`/`null`.

Do **not** keep iterating selectors blindly; the next agent (or human) should
be able to pick up from a clear, reproducible state.

