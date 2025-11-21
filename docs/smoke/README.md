# Copilot Smoke Test Notes

- Default to **single turn** (`max-turns=1`) in the automation. Multi-turn is opt-in and should be driven by a human (pass `--max-turns 2` if you explicitly want a follow-up).
- Run headful under xvfb when unattended:
  ```bash
  ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts docs/smoke/prompt.md \
    --apply-mode none --model gpt-5
  # optional follow-up turn:
  ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts docs/smoke/prompt.md \
    --apply-mode none --model gpt-5 --max-turns 2
  ```
- If no diff is returned, save the last assistant response in `docs/smoke/response_oracle.md` for comparison with `docs/smoke/response_web.md`; treat manual follow-ups as a human/agent chat step.
- Goal is to extract only the latest assistant markdown (avoid sidebar/thread noise) and capture either a valid fenced diff or a concise no-diff artifact.
