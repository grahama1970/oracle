# Copilot Web Smoke Test (Gold Standard)

Use this 7‑step checklist to prove Oracle → Copilot Web is working end‑to‑end. Keep it short; copy/paste as needed.

1) **Branch is visible to Copilot**  
   - Work on a feature branch.  
   - Commit and push changes so Copilot can see the code (no local‑only edits).

2) **Prep the prompt**  
   - Start from `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`.  
   - Fill Repo/Branch and exact file paths; keep objectives/constraints/test plan; leave clarifying questions.

3) **Run the review** (pick one)  
   - Automation: `oracle --engine browser --copilot --model gpt-5 --copilot-max-turns 3 --prompt "<completed template>" --apply-mode none`  
     (or `pnpm tsx scripts/copilot-code-review.ts <template> --max-turns 3 --apply-mode none`).  
   - Manual UI: open Copilot Web, switch model to **GPT-5**, paste the same request, send.

4) **Wait for completion**  
   - No spinner/stop button; response text stable. Oracle should emit `completionPath` in `result.json`.

5) **Capture artifacts**  
   - Save assistant markdown (answers + diff).  
   - Ensure `diff.patch`, `result.json` (and metrics if enabled) are written.

6) **Validate outputs (pass/fail)**  
   - `result.json`: `status=success`, `diffFound=true`, `diffValidated=true`, `completionPath` present, `sidebarDetected=false`.  
   - `git apply --check diff.patch` passes; paths are safe.  
   - Markdown contains answers to clarifying questions and matches the patch intent.

7) **Apply only what you concur with**  
   - Review diffs; apply agreed hunks (or keep apply-mode check/none for smoke).  
   - If diffs are missing/invalid, rerun with diagnostics (e.g., selector test, `--dom-snapshot`) before calling fail.

Keep this test handy—do not bury it in CONTRACT.md.
