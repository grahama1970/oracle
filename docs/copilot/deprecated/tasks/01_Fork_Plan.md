# Comprehensive Implementation Plan: Fork & Extend Oracle for Automated Copilot Diff Generation and Python Codex Integration

This plan enables your Python Codex agent to automatically invoke a forked Oracle CLI to deliver large code-review / patch-generation prompts to Copilot Web, capture a unified diff, validate/apply it, and run tests—removing all manual copy/paste steps. It is structured for the Codex agent to execute autonomously.

---

## 0. Goal Recap

Automate the workflow:

1. Codex assembles a patch spec (prompt + context).
2. Oracle (browser engine) injects it into Copilot Web.
3. Response is captured; first valid unified diff extracted.
4. Patch validated (`git apply --check`), optionally applied & committed.
5. Tests/build run; results published (JSON).
6. Artifacts saved for audit + retries.

---

## 1. Repository Fork & Branching Strategy

| Step | Action | Notes |
|------|--------|-------|
| 1.1 | Fork `steipete/oracle` to `grahama1970/oracle-copilot` | Keep MIT license & attribution. |
| 1.2 | Create protected `main` branch mirroring upstream. | Use for periodic upstream syncs. |
| 1.3 | Create feature branch naming convention: `feat/copilot-diff-gen`, `fix/…`, `chore/upstream-sync-YYYYMMDD`. | Consistent automation hooks. |
| 1.4 | Add an `UPSTREAM_SYNC.md` describing how to rebase / merge from original. | Automate monthly sync job later. |

---

## 2. New Capabilities to Add (CLI & Internals)

| Feature | Purpose |
|---------|---------|
| `--emit-diff-only` | Extract first valid unified diff fenced block. |
| `--diff-output <path>` | Explicit path for diff file (default session dir). |
| `--json-output <path>` | Machine-readable run result (status, timings, diff metadata). |
| `--strict-diff` | Fail run if no valid unified diff (non-zero status). |
| `--retry-if-no-diff` | Auto follow-up prompt if first attempt lacks diff. |
| `--max-retries <n>` | Limit retries (default 1). |
| `--followup-prompt "<text>"` | Custom override for retry injections. |
| `--apply-mode <none|check|apply|commit>` | Decide patch handling level. |
| `--git-root <path>` | Repo root for patch application (default CWD). |
| `--branch <git-branch>` | Record intended target branch (metadata only). |
| `--commit-message "<msg>"` | Commit after successful apply (if `apply|commit`). |
| `--exit-on-partial` | Treat truncated / malformed diff as failure. |
| `--slug <custom>` | Deterministic session name for Python agent lookup. |
| `--sanitize-prompt` | Strip secrets or unsafe tokens prior to injection. |
| `--secret-scan` | Dry-run scan; fails if potential secrets detected. |
| `--dom-snapshot <intervalMs>` | Dump assistant message HTML snapshots for debug. |

---

## 3. File-Level Change Plan

| File | Action |
|------|--------|
| `src/browser/types.ts` | Extend `BrowserRunOptions` with new flags. |
| `src/browser/constants.ts` | Add regex patterns for diff detection, default follow-up text, secret scan regex list. |
| `src/browser/utils.ts` | Add `extractUnifiedDiff()`, `isValidUnifiedDiff()`, `scanForSecrets()`, `writeJsonOutput()`. |
| `src/browser/sessionRunner.ts` | Integrate extraction, retry loop, patch handling, JSON emission, metadata enrichment. |
| `src/browser/index.ts` | Parse new CLI flags, map to `BrowserRunOptions`. |
| `src/browser/gitIntegration.ts` (new) | Encapsulate branch checkout, patch validate/apply, optional commit. |
| `src/browser/diffExtractor.ts` (new) | Dedicated diff block parsing & scoring (explanatory vs diff vs code). |
| `src/browser/retryStrategy.ts` (new) | Logic for follow-up prompt injection & retry counting. |
| `src/oracle/run.ts` (if impacted) | Ensure API engine ignores patch flags cleanly (browser-only features). |
| `README.md` | New section: “Copilot Diff Automation Flags”. |
| `docs/INTEGRATION-PYTHON.md` (new) | How Python Codex agent hooks into oracle outputs. |
| `tests/` | Add unit tests for diff extraction, secret scanning, apply-mode permutations. |

---

## 4. Data & Metadata Model Extensions

Enhance session JSON (`session.json`) with fields:

```json
{
  "diffFound": true,
  "diffValidated": true,
  "diffApplied": true,
  "applyMode": "commit",
  "branch": "fix/restore-pipeline-steps-20251031-073204",
  "commitSha": "abc123def456",
  "retryCount": 0,
  "incompleteReason": null,
  "patchBytes": 12894,
  "promptChars": 5342,
  "responseChars": 24001,
  "copilotDomSnapshots": ["snapshot-001.html", "snapshot-002.html"],
  "secretScan": { "status": "ok", "matches": [] }
}
```

Separate JSON machine-output (`result.json`) for Python consumption (subset of above, plus elapsed time).

---

## 5. Unified Diff Detection Logic

Heuristics (ordered):

1. Collect all fenced blocks: ```diff …```, then others.
2. Score each block:
   - Contains `diff --git` = +5
   - Contains at least one hunk header `@@ -\d+,\d+ \+\d+,\d+ @@` = +3
   - Starts with `diff --git` line = +2
   - Size (prefer > 200 chars) = +1
3. Select highest score; validate:
   - Must contain ≥1 hunk header.
   - Optional strict numeric hunk header formatting only.

If invalid and `--retry-if-no-diff` set → follow-up prompt injection.

---

## 6. Retry Strategy

Algorithm:

1. Attempt #0: Original prompt.
2. If no valid diff or malformed (and `strict-diff`), build follow-up:
   ```
   Retry: Return ONLY one fenced ```diff block containing a valid unified diff with numeric hunk headers. No prose, no explanations.
   ```
3. Reinject follow-up; re-run extraction.
4. Stop at `--max-retries`.
5. Record `retryCount` and final status.

Edge cases:
- If second attempt also fails: set `status=diff_missing`; exit code = 2.
- If partial/truncated (fence starts but no closing) and `--exit-on-partial` enabled: `status=partial`.

---

## 7. Patch Handling Modes

| Mode | Behavior |
|------|----------|
| `none` | Skip all git operations; just emit diff patch file. |
| `check` | Run `git apply --check`; record validation result. |
| `apply` | Validate + apply; no commit. |
| `commit` | Validate + apply + commit with `--commit-message`. |

Implementation details:
- Ensure `gitRoot` existence & branch presence.
- Do not create branch if missing (fail loudly).
- Use `spawnSync` wrappers and capture stderr → store in metadata.

---

## 8. Secret & Safety Scan

Regex set (examples):

- AWS key: `AKIA[0-9A-Z]{16}`
- Generic bearer token: `Bearer [A-Za-z0-9_\-]{20,}`
- Private key header: `-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE KEY)`
- Common API key variable names: `API_KEY=`, `SECRET_KEY=`

Actions:
- If `--secret-scan` and matches found → fail run with `status=secret_detected`.
- If `--sanitize-prompt` → redact matched substrings with `***REDACTED***`.

---

## 9. DOM Snapshot Debugging

If `--dom-snapshot <intervalMs>` provided:
- During streaming loop, capture assistant container HTML every interval.
- Save as `snapshot-<N>.html` under session dir.
- Cap max snapshots (e.g., 50) to avoid disk bloat.

---

## 10. Python Codex Agent Integration Contract

Python reads `result.json`:

| Field | Purpose |
|-------|---------|
| `status` | `success|diff_missing|partial|secret_detected|apply_failed|commit_failed|timeout|error` |
| `diffPath` | Full path to `diff.patch` if present. |
| `branch` | Recorded branch; agent verifies matches desired branch. |
| `retryCount` | Used for escalation logic. |
| `elapsedMs` | Performance monitoring. |
| `commitSha` | Present if commit performed. |
| `patchBytes` | Sanity check (e.g., ignore < 200 bytes). |

Python logic:

1. If `status=success` and `diffPath` exists → proceed to test phase.
2. If `diff_missing|partial|secret_detected` → escalate / re-prompt model outside Oracle.
3. If `apply_failed` → attach logs to diagnostics artifact.

---

## 11. CLI Parsing Changes

Add to `src/cli` (or existing CLI parser):

- Extend help text & README with examples:
  ```
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

---

## 12. Testing Strategy

| Test Category | Cases |
|---------------|-------|
| Diff Extraction Unit | Single fenced diff; multiple blocks; no diff; truncated fence; diff with no hunks; diff with hunks. |
| Retry Logic | Initial miss → retry succeeds; retry still fails; max-retries boundary. |
| Patch Validation | Valid diff applies cleanly; invalid diff fails check; partial diff with `exit-on-partial`. |
| Secret Scan | Prompt containing synthetic secrets; sanitized output. |
| JSON Output | All modes produce expected fields; error states captured. |
| Apply Modes | none → no git calls; check → validation only; apply → files updated; commit → commit recorded. |
| DOM Snapshot (mock) | Interval triggers; max snapshots respected. |
| Performance | Large prompt (simulate long diff) under timeout. |

Mocking:
- Use dependency injection or abstraction for git commands & file writes.
- Simulate assistant responses with fixtures for diff blocks.

---

## 13. Error Taxonomy Expansion

Define internal enum (or string union):

- `timeout`
- `error` (uncaught exception)
- `diff_missing`
- `partial`
- `secret_detected`
- `apply_failed`
- `commit_failed`
- `invalid_diff`
- `no_input` (input selector not found)

Persist in session metadata & use for exit codes:

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Generic error / unexpected exception |
| 2 | Diff missing / invalid / partial |
| 3 | Secret detected |
| 4 | Git apply failed |
| 5 | Commit failed |
| 6 | Timeout |

---

## 14. Logging & Observability

- Append to existing `output.log`:
  - Start marker for each phase: `[phase] extraction`, `[phase] retry`, `[phase] git-apply`.
  - Errors prefixed `[error]`.
- Optional metrics export (`--metrics-output metrics.json`):
  - Timestamps for phase starts/ends.
  - Poll iterations count.
  - Streaming stabilization cycles.

---

## 15. Documentation Additions

Add to `README.md`:

- New section: “Copilot Unified Diff Automation”.
- Flag matrix.
- Example end-to-end usage.
- Failure modes & resolution.
- Python integration quickstart linking `docs/INTEGRATION-PYTHON.md`.

Add `docs/INTEGRATION-PYTHON.md` with:
- JSON contract sample.
- Suggested Python snippet.
- Makefile integration.
- Retry logic pseudocode.

````markdown name=docs/INTEGRATION-PYTHON.md
# Python Integration for Oracle Copilot Diff Runs

## Example JSON Result
```json
{ "status": "success", "diffFound": true, "diffPath": "...", "retryCount": 0 }
```

## Python Snippet
```python
import json, subprocess, sys, pathlib
data = json.loads(pathlib.Path("result.json").read_text())
if data["status"] != "success":
    sys.exit("Oracle run failed: " + data["status"])
# proceed...
```
````

---

## 16. Security & Safety

| Risk | Mitigation |
|------|------------|
| Secret leakage in prompt | `--secret-scan` & `--sanitize-prompt` flags |
| Malicious diff altering unrelated files | Validate target paths (optional: restrict to allowed globs) |
| Oversized prompt causing UI failure | Preflight size check (`prompt.length` / configurable max) |
| Unintended branch patching | Require explicit `--branch`; warn if current local branch differs |
| Diff injection attack | Enforce `strict-diff` and hunk regex; refuse suspicious blocks lacking headers |

Add optional flag `--restrict-path-prefix <dir>` to validate `diff --git a/... b/...` paths fall under a specific subtree.

---

## 17. Performance & Reliability Considerations

| Concern | Approach |
|---------|----------|
| Streaming flakiness | Keep stabilization heuristic + allow configurable poll interval |
| DOM changes | Maintain list of fallback selectors; log which matched |
| Headless login expiration | Detect login page; instruct user to re-run without `--headless` |
| Large diff memory usage | Stream accumulation; warn if diffBytes > threshold (e.g., 500 KB) |

---

## 18. CI Integration

Add GitHub Actions workflow:

- `ci.yml`:
  - Run unit tests.
  - Lint TypeScript (`pnpm lint`).
  - Build.
  - Quick synthetic diff extraction test (mock response).
- `nightly-health.yml`:
  - Trigger simple Copilot run (placeholder prompt).
  - Confirm JSON output status != `error`.
  - Optional Slack/webhook notification.

---

## 19. Python Codex Agent Flow (Final Orchestration)

1. Generate prompt markdown file: `prompts/<slug>.md`.
2. Invoke oracle fork:
   ```bash
   oracle --engine browser \
     --prompt "$(cat prompts/<slug>.md)" \
     --slug <slug> \
     --emit-diff-only --diff-output ./artifacts/<slug>.patch \
     --json-output ./artifacts/<slug>.json \
     --strict-diff --retry-if-no-diff --max-retries 1 \
     --apply-mode none
   ```
3. Read JSON; if success:
   - Validate patch (Python script) if using `apply-mode none`.
   - Apply + test; report.
4. If `diff_missing`:
   - Escalate: adjust prompt or ask LLM to refine specification.
5. Archive artifacts (prompt, patch, result JSON, logs) under `ai_runs/<date>/<slug>/`.
6. Post summary (status, patch size, test results) to dashboard or Slack.

---

## 20. Timeline (Indicative)

| Week | Tasks |
|------|-------|
| 1 | Fork, branch setup, add types/flags scaffolding, diff extraction function, tests for extraction. |
| 2 | Implement sessionRunner integrations, retry, JSON output, apply modes, secret scan, README updates. |
| 3 | Add Python integration docs, CI workflows, DOM snapshot, restrict-path-prefix, extended error taxonomy. |
| 4 | Harden selectors, upstream sync rehearsal, performance optimization, finalize security review, release v0.1.0. |

---

## 21. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Upstream breaking changes | Monthly sync process; isolate fork changes in diff-related modules. |
| Copilot UI selector shift | Fallback selector list + debug logging + nightly health check. |
| Invalid patches silently applied | Always `--strict-diff` + `git apply --check` before actual apply/commit. |
| Secret/PII leak through prompts | Mandatory `--secret-scan` in CI environment. |
| Complexity creep | Keep feature flags modular; avoid mixing git operations with browser internals. |

---

## 22. Example New Files (Skeletons)

```typescript name=src/browser/diffExtractor.ts
import { BrowserAutomationError } from './errors.js';

export interface DiffExtractionResult {
  rawBlocks: string[];
  selectedBlock?: string;
  score?: number;
  reason?: string;
}

const HUNK_RE = /@@ -\d+,\d+ \+\d+,\d+ @@/;
const DIFF_HEADER_RE = /^diff --git /m;

export function extractUnifiedDiff(markdown: string): DiffExtractionResult {
  const fenced = [...markdown.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map(m => m[1].trim());
  const scored = fenced.map(block => {
    let score = 0;
    if (DIFF_HEADER_RE.test(block)) score += 5;
    if (HUNK_RE.test(block)) score += 3;
    if (block.startsWith('diff --git')) score += 2;
    if (block.length > 200) score += 1;
    return { block, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { rawBlocks: [], reason: 'no_fenced_blocks' };
  }
  const best = scored[0];
  return {
    rawBlocks: scored.map(s => s.block),
    selectedBlock: best.block,
    score: best.score,
  };
}

export function isValidUnifiedDiff(diff: string, strict = false): boolean {
  if (!diff) return false;
  if (!DIFF_HEADER_RE.test(diff)) return false;
  if (!HUNK_RE.test(diff)) return false;
  if (strict) {
    // additional numeric header checks could be added here
  }
  return true;
}
```

```typescript name=src/browser/gitIntegration.ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface GitResult {
  ok: boolean;
  stderr?: string;
  stdout?: string;
}

function run(cmd: string[], cwd?: string): GitResult {
  const p = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf-8' });
  return { ok: p.status === 0, stderr: p.stderr, stdout: p.stdout };
}

export function validatePatch(patchPath: string, repoRoot: string): GitResult {
  return run(['git', 'apply', '--check', patchPath], repoRoot);
}

export function applyPatch(patchPath: string, repoRoot: string): GitResult {
  return run(['git', 'apply', patchPath], repoRoot);
}

export function checkoutBranch(branch: string, repoRoot: string): GitResult {
  return run(['git', 'checkout', branch], repoRoot);
}

export function commitAll(message: string, repoRoot: string): GitResult {
  return run(['git', 'commit', '-am', message], repoRoot);
}
```

```typescript name=src/browser/retryStrategy.ts
export interface RetryContext {
  attempt: number;
  maxRetries: number;
  followupPrompt: string;
}

export function shouldRetry(hasValidDiff: boolean, attempt: number, maxRetries: number): boolean {
  if (hasValidDiff) return false;
  return attempt < maxRetries;
}

export function buildFollowupPrompt(base: string, override?: string): string {
  if (override) return override;
  return `Retry: ONLY return a single fenced \`\`\`diff block containing a valid unified diff with numeric hunk headers. No commentary.\n\n${base}`;
}
```

---

## 23. Acceptance Criteria

| Criterion | Description |
|-----------|-------------|
| AC1 | Running new CLI with spec prompt produces `diff.patch` containing valid unified diff. |
| AC2 | `result.json` has `status=success`, `diffFound=true`. |
| AC3 | Invalid diff triggers retry; second success recorded with `retryCount=1`. |
| AC4 | Secret detection fails run with `status=secret_detected`. |
| AC5 | Apply/commit mode commits changes and records `commitSha`. |
| AC6 | Python integration script (prototype) consumes JSON and applies patch without manual intervention. |
| AC7 | All new flags documented in README with examples. |
| AC8 | Unit tests cover diff extraction variants (≥6 cases). |
| AC9 | CI passes (lint, tests). |
| AC10 | DOM snapshot feature produces at least one HTML file when enabled. |

---

## 24. Final Recommendation

Proceed with the fork and implement features incrementally:
1. Diff extraction + JSON output.
2. Apply modes + retry.
3. Secret scan + sanitization.
4. Documentation + tests.
5. Python agent integration.

Once stable, consider upstream PR (non-mandatory) or keep fork specialized.

---

## 25. Next Action for Codex Agent

1. Fork repository.
2. Create branch `feat/copilot-diff-generation`.
3. Apply file changes (create new modules).
4. Modify existing CLI & runner.
5. Add tests & docs.
6. Run sample end-to-end with your Step 06 prompt.
7. Produce `result.json` & validate patch automatically.

When ready, I can produce a concrete unified diff implementing phase 1 (diff extraction + JSON output) if you say: “Generate phase 1 patch.”

---

Let me know if you want:
- Phase 1 diff immediately,
- Expanded secret scanning regex set,
- A Python harness generator script.

Which would you like next?