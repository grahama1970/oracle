# Copilot Browser Mode (Current Behavior)

- Engine: `--engine browser --copilot`
- Model picker: target GPT-5 (chip may show “GPT-5” or alias “Spark”). We log chip value; no hard-fail on alias.
- Timeouts: 120s hard timeout; inactivity bounded by response stability (spinner sends/stop/log) and mutation observer.
- Turns: default 1 turn; additional turns are human opt-in (`--max-turns 2` if desired).
- Completion signals: stop gone, send enabled, spinner gone, markdown stability, mutation observer idle.
- Extraction: capture latest assistant markdown body (`.markdown-body[data-copilot-markdown="true"]`) only; ignore sidebar/thread.
- Artifacts: responses/diffs in `tmp/`; smoke comparisons in `docs/smoke/`.

For historical notes, see legacy `docs/browser-mode.md` (not modified here).
