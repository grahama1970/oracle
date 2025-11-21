# Copilot Smoke Test (Self-Contained)

Default: single turn. Human can opt into a second turn with `--max-turns 2`.

Run (headful under xvfb):
```bash
ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts docs/smoke/prompt.md \
  --apply-mode none --model gpt-5
# Optional follow-up turn
ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts docs/smoke/prompt.md \
  --apply-mode none --model gpt-5 --max-turns 2
```

Expectations:
- Latest assistant markdown only (no sidebar). Diff in a single fenced ```diff block.
- If no diff: save assistant reply to `docs/smoke/response_oracle.md` for comparison with `response_web.md`.

What to verify:
- `status=success` when diff found; `forced_timeout` otherwise.
- Diff applies or is close; adjust manually as needed (web models aren’t 100% git-apply clean).
- Model chip logs GPT-5 or alias; timeout bounded at 120s.

Legacy references remain untouched; this file is the active smoke recipe.
