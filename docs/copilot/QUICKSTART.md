# Quickstart (Copilot Browser Flow)

1) **Install deps**  
   ```bash
   pnpm install
   ```

2) **Ensure Chrome profile is authenticated**  
   Profile path: `~/.oracle/chrome-profile` (shared by Oracle runs).  
   Validate quickly (headless OK):  
   ```bash
   xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
   ```
   You should see “Copilot access: ✅ CHAT READY”.

3) **Run the smoke test (single turn)**  
   ```bash
   ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts docs/smoke/prompt.md \
     --apply-mode none --model gpt-5
   ```
   Expected artifacts: unified diff + clarifying answers in `docs/smoke/response_oracle.md`. Compare against `docs/smoke/response_web.md`.

4) **Human opt-in for a second turn (optional)**  
   Add `--max-turns 2` to the command above if you want a follow-up turn; default is 1 to keep automation stable.

5) **Troubleshooting**  
   - Model chip not GPT‑5? Rerun after selecting GPT‑5 manually.  
   - Auth issues? See `auth.md` for authentication setup, or `legacy/GITHUB_COPILOT_AUTH_COMPLETE_GUIDE.md` for detailed historical guide.  
   - Hanging at completion? Review logs in `tmp/` and see `troubleshooting.md` for solutions.

6) **Integrate downstream**  
   The JSON contract for consuming diffs/answers is in `INTEGRATION-PYTHON.md`.

7) **Use the Copilot review template (copy/paste ready)**  
   - **Human (manual in Copilot Web):** open the template `docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md`, fill in repo/branch/paths, then paste into Copilot Web (picker on GPT‑5). Wait for the answer + diff.  
   - **Agent via CLI (Oracle):** run the template directly:  
     ```bash
     ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts \
       docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md \
       --apply-mode none --model gpt-5
     ```  
   - **Agent via bash helper:** use the bundled script (defaults to the template):  
     ```bash
     bash docs/copilot/tests/use-copilot.sh docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md 1 none
     ```  
   Keep `--max-turns` at 1 unless you intentionally need a follow-up turn.
