# Oracle Copilot Fork – Key Features

- **Browser-driven Copilot runs**: Drives Copilot Web via the Oracle CLI/browser engine, targeting GPT‑5 and extracting only the final assistant markdown (diff + clarifying answers).
- **Auth reuse, headless or headful**: Reuses the Chrome profile at `~/.oracle/chrome-profile`; supports xvfb headless runs or attaching to an existing remote-debug Chrome.
- **Robust completion detection**: Multiple stop signals (spinner gone, send re-enabled, markdown stability, mutation observer idle) to avoid hanging at end of response.
- **Model selection safeguards**: Reads the model chip; logs/alerts if the picker isn’t on GPT‑5 to prevent wrong-model diffs.
- **Single-turn default with human opt-in**: CLI defaults to 1 turn; additional turns require explicit `--max-turns` to keep automation stable.
- **Structured outputs for downstream agents**: Emits unified diff text and clarifying Q&A; JSON contract documented for Python integration (`INTEGRATION-PYTHON.md`).
- **Smoke-testable workflow**: Gold-standard smoke in `smoke.md` with expected prompt/response samples for fast validation.
