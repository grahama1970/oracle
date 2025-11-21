# Quickstart (Copilot Browser Flow)

## Setup (mac/win/linux)
- Run from repo root: `/home/graham/workspace/experiments/oracle`.
- Install deps: `pnpm install` (Node 20+).
- Chrome available (set `CHROME_PATH` if needed).
- `xvfb-run` for headless:
  - Ubuntu/Debian: `sudo apt-get install -y xvfb`
  - macOS: run headful or install XQuartz + `xvfb` via Homebrew
  - Windows/WSL: use `xvfb-run` in WSL or run headful on Windows Chrome
- Authenticated Copilot profile at `~/.oracle/chrome-profile` (see `auth.md` to set this up).
- Use GPT‑5; default turns = 1.
- Copilot model picker (observed): GPT‑4.1, GPT‑5, GPT‑4o, GPT‑5.1 Preview, Claude Sonnet 4, Claude Sonnet 4.5, Claude Haiku 4.5. We target GPT‑5 by default.

### Validate auth (required before any run)
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```
Expect: “Copilot access: ✅ CHAT READY”. If not, fix auth first (see `auth.md`).

## Human use (manual fallback — tedious copy/paste)
If automation/CLI isn’t available:
1) Open `docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`.
2) Edit repo/branch/paths and the specific files/areas to review; ensure the branch is committed and pushed so Copilot Web can see it.
3) In Copilot Web, select GPT‑5 (or another Copilot model), paste the prompt, wait for clarifying answers + diff. Manual copy/paste is slower; prefer the CLI/helper above when possible.
4) If no diff, re-check that the branch is pushed and retry once.

## Project Agent with Human prompt (one-turn, low risk)
Recommended: **use the helper** (no bash knowledge needed; copy/paste and run). Ensure your branch is pushed:
```bash
git fetch origin && BR=$(git branch --show-current) && git rev-parse --verify "origin/$BR" >/dev/null || { echo "Branch not pushed; ask the human to push before running Copilot."; exit 1; }
bash docs/copilot/tests/use-copilot.sh docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md 1 none
```
Do not auto-commit or push; if the branch isn’t on the remote, stop and consult the human.
Explicit CLI (advanced):
```bash
ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts \
  docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md \
  --apply-mode none --model gpt-5 --max-turns 1 \
  --json-output tmp/copilot-review.json --timeout-ms 180000 \
  --retry-if-no-diff --max-retries 1 \
  --browser-url https://github.com/copilot/
```
Before running, update the template with repo/branch/paths and the *focus area* (the code you want reviewed).  
Outputs: `tmp/copilot-review-*.{log,json,patch|no-diff.txt}`. Success looks like `status=success` in the JSON; `diff_missing` means no diff found.
Return to the human: share the JSON path (e.g., `tmp/copilot-review.json`) and any patch file produced; if `diff_missing`, share the no-diff text file.
If multiple retries, report the highest-numbered artifact set and the retry count.

## Project Agent autonomous (guardrails)
- **Precheck:** run the auth validator above; abort if not ready (non-zero exit).
- **Branch visibility:** ensure repo/branch in the template is pushed and visible to Copilot:
  ```bash
  BR=$(git branch --show-current)
  git ls-remote --heads origin "$BR" >/dev/null || { echo "Branch not on origin"; exit 1; }
  ```
- **Timeout & turns:** keep `--max-turns 1`; set `--timeout-ms 180000` by default.
- **Model check:** ensure logs show model chip GPT‑5; abort/retry if mismatched.
- **Command:** same as above with `--json-output tmp/copilot-review.json --timeout-ms 180000 --retry-if-no-diff --max-retries 1 --browser-url https://github.com/copilot/`.
- **Exit policy:** if auth validation fails, model chip != GPT‑5, or JSON `status` ∈ {`diff_missing`,`timeout`,`error`} after retries → abort and surface the log path and JSON result.

Status → action (after retries)
- `success`: proceed; use `diffOutput` and patch.
- `diff_missing` / `timeout` / `error`: stop, report log + JSON to human.

## Troubleshooting (quick)
- Marketing/login page: rerun auth (see `auth.md`), re-validate. Details: `troubleshooting/COPILOT_AUTH_TROUBLESHOOTING.md`.
- Model chip not GPT‑5: select GPT‑5 manually, rerun. Selector/helpers: `troubleshooting/COPILOT_BROWSER_DEBUG.md`.
- Hangs/no completion: check `tmp/copilot-review-*.log`; see `troubleshooting/COPILOT_RESPONSE_FIX_SUMMARY.md` and `troubleshooting/COPLIOT_HANG_FIX.md`.
- No diff: confirm template repo/branch/paths edited and branch is pushed; retry with `--max-turns 2`.
- Sample success: `tmp/copilot-review.json` contains `"status":"success"` and `diffOutput`.
- Sample no-diff: `"status":"diff_missing"` with `noDiffOutput`.
- Model chip log check: grep `Model chip:` in `tmp/copilot-review-*.log` and ensure it is `GPT-5`; otherwise abort/retry.

Sample JSON (success)
```json
{"status":"success","diffOutput":"tmp/copilot-review.patch","retryCount":0}
```
Sample JSON (no diff)
```json
{"status":"diff_missing","noDiffOutput":"tmp/copilot-review-no-diff.txt","retryCount":1}
```
- Sample success: `tmp/copilot-review.json` has `"status":"success"` and a `diffOutput` path.
- Sample no-diff: `"status":"diff_missing"` with `noDiffOutput` path.

## Integrate downstream
See `INTEGRATION-PYTHON.md` for the JSON contract used by agents.
