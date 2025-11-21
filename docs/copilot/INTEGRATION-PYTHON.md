# Python Integration for Oracle Copilot Diff Runs

Oracle’s browser engine can drive Copilot / ChatGPT to produce a unified diff, extract that patch, and emit a JSON result file that your Python agent can consume.

This document outlines the JSON contract and a minimal integration pattern.

## Example JSON results

```json
{
  "status": "success",
  "diffFound": true,
  "diffValidated": true,
  "diffApplied": false,
  "applyMode": "none",
  "branch": "feat/copilot-diff-generation",
  "commitSha": null,
  "retryCount": 0,
  "elapsedMs": 124567,
  "promptChars": 5321,
  "responseChars": 21034,
  "patchBytes": 12894,
  "diffPath": "/path/to/session/diff.patch",
  "secretScan": {
    "status": "ok",
    "matches": []
  },
  "snapshots": [
    "snapshot-001.html"
  ]
}
```

Other statuses (examples)

- `diff_missing`:
```json
{"status":"diff_missing","retryCount":1,"noDiffOutput":"tmp/copilot-review-no-diff.txt"}
```
- `timeout`:
```json
{"status":"timeout","retryCount":1,"elapsedMs":180000,"noDiffOutput":"tmp/copilot-review-no-diff.txt"}
```
- `error`:
```json
{"status":"error","errorMessage":"model chip mismatch","retryCount":0}
```
- `secret_detected`:
```json
{"status":"secret_detected","retryCount":0,"promptSanitized":true}
```

Key fields:

- `status`: one of `success`, `diff_missing`, `partial`, `secret_detected`, `apply_failed`, `commit_failed`, `invalid_diff`, `timeout`, `error`, or `no_input`.
- `diffPath`: absolute path to the extracted diff file, when present.
- `diffFound`: whether a candidate unified diff block was found.
- `diffValidated`: whether the diff passed basic unified-diff validation (and, when applicable, `git apply --check`).
- `diffApplied`: whether the patch was actually applied to the working tree (true for `apply`/`commit` modes on success).
- `applyMode`: `none`, `check`, `apply`, or `commit`.
- `branch`: the branch label you provided via `--branch` (metadata only).
- `commitSha`: the resulting `HEAD` commit SHA when `applyMode=commit` succeeds.
- `retryCount`: number of follow-up attempts performed (0 = first response used).
- `elapsedMs`: end-to-end browser run time in milliseconds.
- `promptChars` / `responseChars`: character counts for the composed prompt and assistant answer.
- `patchBytes`: size of the extracted patch in bytes.
- `secretScan`: summary of the prompt secret scan when `--secret-scan` or `--sanitize-prompt` is used.
- `snapshots`: relative or absolute paths to any saved DOM snapshot HTML files when `--dom-snapshot` is enabled.

## Launching Oracle from Python

From Python, you typically:

1. Build a markdown prompt file describing the desired patch (`prompts/<slug>.md`).
2. Invoke the Oracle CLI in browser mode with diff automation flags.
3. Load the resulting JSON and act based on `status` and `diffPath`.

### Minimal Python snippet

```python
import json
import os
import pathlib
import subprocess
import sys
from typing import Any, Dict


def run_oracle_diff(slug: str, prompt_path: pathlib.Path, artifacts_dir: pathlib.Path) -> Dict[str, Any]:
  artifacts_dir.mkdir(parents=True, exist_ok=True)
  diff_path = artifacts_dir / f"{slug}.patch"
  json_path = artifacts_dir / f"{slug}.json"

  cmd = [
    "oracle",
    "--engine",
    "browser",
    "--prompt",
    prompt_path.read_text(),
    "--slug",
    slug,
    "--emit-diff-only",
    "--diff-output",
    str(diff_path),
    "--json-output",
    str(json_path),
    "--strict-diff",
    "--retry-if-no-diff",
    "--max-retries",
    "1",
    "--apply-mode",
    "none",
    "--timeout-ms",
    "180000",
  ]

  env = dict(**os.environ)
  env["ORACLE_NO_DETACH"] = "1"
  # Optional: force secret scanning in CI
  # cmd.append("--secret-scan")

  result = subprocess.run(cmd, env=env, text=True)
  if result.returncode != 0:
    raise RuntimeError(f"Oracle run failed (exit {result.returncode})")

  data = json.loads(json_path.read_text())
  return data


def main() -> None:
  slug = "fix-example-bug"
  prompt_path = pathlib.Path("prompts") / f"{slug}.md"
  artifacts_dir = pathlib.Path("artifacts") / slug

  data = run_oracle_diff(slug, prompt_path, artifacts_dir)
  status = data.get("status")
  if status != "success" or not data.get("diffFound"):
    sys.exit(f"Oracle run did not produce a usable diff: {status}")

  diff_path = pathlib.Path(data["diffPath"])
  # From here, you can apply the patch, run tests, and publish results.
  print(f"Patch ready at: {diff_path}")


if __name__ == "__main__":
  main()
```

## Suggested orchestration flow

1. **Prepare prompt** — Write a deterministic markdown spec for the desired change (files, invariants, test expectations).
2. **Call Oracle** — Use `--engine browser --emit-diff-only` with your chosen `--slug`, `--diff-output`, and `--json-output`.
3. **Inspect `status`**:
   - `success` — proceed to patch validation / application.
   - `diff_missing` / `partial` / `invalid_diff` — escalate (ask a human or re-prompt your LLM).
   - `secret_detected` — fix the spec/prompt (secret content present).
   - `apply_failed` / `commit_failed` — inspect Git diagnostics and the generated patch.
4. **Validate + apply patch** — either in Python or by letting Oracle apply/commit via `--apply-mode`.
5. **Run tests/build** — capture results and attach the patch + logs as artifacts.
6. **Archive artifacts** — store `prompt.md`, `diff.patch`, `result.json`, `output.log`, and any DOM snapshots for auditing.

This keeps Oracle’s responsibilities focused on **prompt assembly, browser automation, and diff handling**, while your Python agent remains in charge of orchestration, policy, and test execution.
