# Oracle Copilot Fork – Working Context (Restart Guide)

This file captures the current state of the **`/home/graham/workspace/experiments/oracle`** repo so a new agent (or human) can restart work without re‑discovering everything. It is intentionally opinionated and practical.

Last updated: 2025‑11‑19

---

## 1. High‑Level Goal

- This is a fork of `@steipete/oracle` whose **primary purpose** is to:
  - Let an external agent (Python Codex, etc.) send **code review / patch prompts** to **GitHub Copilot Web** (`https://github.com/copilot/`).
  - Capture Copilot’s response, especially **unified diffs**.
  - Run a diff pipeline: extract → validate → (optionally) apply → (optionally) commit & push.
  - Emit machine‑readable artifacts (`diff.patch`, `result.json`, `metrics.json`) for downstream automation.
- API engine behavior (OpenAI Responses) should remain unchanged.
- The **contract** for this behavior is documented in `docs/CONTRACT.md`. That is the spec; this file is just context.

---

## 2. Environment Snapshot

- Host: Ubuntu workstation.
- User: `graham`.
- Repo path: `/home/graham/workspace/experiments/oracle`.
- Node: `v22.15.0`.
- Package manager: `pnpm`.
- Chrome:
  - Binary: `/usr/bin/google-chrome`.
  - Standard profile root: `/home/graham/.config/google-chrome`.
  - There is at least one normal GUI Chrome profile where GitHub is **already logged in**.
  - Live Chrome session on port 36235 with Copilot chat loaded.
- Display:
  - SSH from Mac → Ubuntu (often via VS Code remote).
  - `xvfb-run` is installed and available for headless browser runs: `/usr/bin/xvfb-run`.

**.env**

- Repo‑local `.env` exists at `/home/graham/workspace/experiments/oracle/.env`.
- It contains (names only, secrets redacted):
  - `GITHUB_PAT_TOKEN="<classic token>"`
  - `GITHUB_USERNAME="<username>"`
  - `GITHUB_PASSWORD="<password>"`
  - You can also optionally add:
    - `GITHUB_TOTP_SECRET="<base32 TOTP secret>"`
    - `GITHUB_OTP_CODE="<one‑off 6‑digit code>"`
    - `CHROME_PATH="/usr/bin/google-chrome"`
    - `CHROME_PROFILE_DIR="<Chrome profile path>"`
- The auth helpers now `import 'dotenv/config'`, so these values are automatically available when you run them via `pnpm tsx`.

---

## 3. Key Files & Scripts

**Core docs**

- `docs/CONTRACT.md` – Canonical contract for this fork (engines, authentication, diff pipeline, exit codes, etc.).
- `README.md` – High‑level project description; now includes a “GitHub Copilot authentication (this fork)” section.
- `docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md` – Template for Copilot review prompts.
- `AUTHENTICATION_SOLUTION_SUMMARY.md` / `SOLUTION_README.md` – Kimi’s solution notes summarizing the auth/debug work.

**Browser / Copilot**

- `src/browser/constants.ts` – ChatGPT/Copilot URLs, selectors, and `COOKIE_URLS` (now includes GitHub + Copilot domains).
- `src/browser/actions/assistantResponse.ts` – Assistant response capture; now has Copilot‑specific path + selectors (see diffs in history).
- `scripts/copilot-poc.ts` – Minimal Copilot POC script that uses `runBrowserMode` with `https://github.com/copilot/`.
- `scripts/use-authenticated-copilot.ts` – Example showing how to use an authenticated Copilot profile for multiple prompts.

**Auth helpers (Kimi’s work)**

- `scripts/authenticate-github-enhanced.ts`
  - Playwright + `otplib` script.
  - Reads `GITHUB_USERNAME`, `GITHUB_PASSWORD`, optional `GITHUB_TOTP_SECRET`, optional `CHROME_PROFILE_DIR`.
  - Tries to log into GitHub, handle 2FA, then verify Copilot chat and persist session.
  - Uses `chromium.launchPersistentContext(profileDir)` with:
    - `profileDir = process.env.CHROME_PROFILE_DIR || "${HOME}/.oracle/chrome-profile"`.
    - `executablePath = CHROME_PATH || "/usr/bin/google-chrome"`.
- `tmp/validate-auth-enhanced.ts`
  - Playwright‑based validator for an existing profile.
  - Checks:
    - GitHub auth (`https://github.com`).
    - Copilot chat access (`https://github.com/copilot?tab=chat`).
    - Optional session marker file under the profile.
  - Respects `CHROME_PROFILE_DIR` and writes `tmp/auth-validation-results.json`.

**Diff / git / result pipeline**

- `src/browser/diffExtractor.ts` – Heuristics to extract the best unified diff block from the assistant response.
- `src/browser/retryStrategy.ts` – Logic for follow‑up prompts when no valid diff appears.
- `src/browser/gitIntegration.ts` – Wraps `git apply`, `git apply --check`, branch/commit helpers.
- `src/browser/sessionRunner.ts` – Orchestrates a browser run:
  - Kicks off `runBrowserMode`.
  - Extracts/validates diffs.
  - Applies/commits patches based on `--apply-mode`.
  - Writes `diff.patch`, `result.json`, `metrics.json`.
- `docs/INTEGRATION-PYTHON.md` – JSON contract for Python consumers.

---

## 4. What’s Implemented (Broadly Working in Code)

This is based on the state of the repo, not just tests:

- **Diff pipeline & JSON artifacts**
  - `--emit-diff-only`, `--diff-output`, `--json-output`, `--strict-diff`, `--retry-if-no-diff`, `--apply-mode`, etc. are wired (see `docs/CONTRACT.md`).
  - `diffExtractor` and `retryStrategy` pick and validate the unified diff block.
  - `sessionRunner`:
    - Calls `runBrowserMode` for browser runs.
    - Handles validation and, for `apply`/`commit`, uses `gitIntegration` to check/apply/commit.
    - Writes `result.json` with fields like: `status`, `diffFound`, `diffValidated`, `diffApplied`, `applyMode`, `branch`, `commitSha`, `retryCount`, `elapsedMs`, `patchBytes`, `diffPath`, `secretScan`.

- **Secret scanning**
  - `scanForSecrets` and `sanitizeSecrets` (in `src/browser/utils.ts`) match common secret patterns (AWS, bearer tokens, JWT‑ish strings, etc.).
  - `--secret-scan` / `--sanitize-prompt` flags are respected.

- **Copilot‑aware browser behavior**
  - `COOKIE_URLS` now includes GitHub + Copilot domains.
  - `scripts/copilot-poc.ts` targets `https://github.com/copilot/` and logs basic run info.
  - `src/browser/actions/assistantResponse.ts`:
    - Detects target host/path and branches between ChatGPT vs Copilot.
    - Copilot path uses Copilot‑specific selectors and a fallback body snapshot.
  - `src/browser/actions/promptComposer.ts` avoids ChatGPT‑specific DOM checks when target is Copilot.

- **Auth helpers compiled and runnable under Node 22**
  - Both `scripts/authenticate-github-enhanced.ts` and `tmp/validate-auth-enhanced.ts`:
    - Use `import 'dotenv/config';`.
    - Are ESM‑safe (no `require.main`).
    - Use `CHROME_PROFILE_DIR` when set.

---

## 5. What Is *Not* Working Right Now (The Real Blocker)

**Short version (as of Nov 19):**  
We can now run `pnpm tsx scripts/copilot-code-review.ts --model gpt-5-pro --max-turns 1 --apply-mode none tmp/COPILOT_REVIEW_SMOKE.md` and the browser flow *reliably exits* instead of hanging. However, Copilot’s reply is currently an HTML fragment (`<h2>Patch</h2>` + truncated “*** Begin Patch” block) that lacks the rest of the unified diff, so the extractor writes `tmp/COPILOT_REVIEW_SMOKE-copilot-review-no-diff.{txt,html}` and stops. We need either (a) Copilot to emit the full diff or (b) a follow-up prompt that forces it to restate the patch with proper fences.

Details / current checkpoints:

- **Browser stability:**
  - `src/browser/actions/copilotNavigation.ts` now considers the paper-airplane icon authoritative (`sendIconVisible`). Even if `data-loading="true"` sticks, the loop exits as soon as the send icon appears with non-empty markdown. Logs show lines like `[content-ready] Early exit: UI done with 1208 chars` followed by the HTML preview.
  - You can attach `scripts/browser-tools.ts inspect --ports <port>` to confirm `scopeTextLen` and markdown lengths; see the most recent run on port `43665`.
- **Response normalization:**
  - `scripts/copilot-code-review.ts` now calls `normalizeAssistantOutput` before diff extraction and saves *both* the normalized `.txt` and raw `.html` when no diff is found (`writeAnswerArtifacts`). The HTML capture shows the Copilot UI chrome (buttons, `<figure>` wrappers, etc.), explaining why our extractor sees only prose unless Copilot gives a fenced block.
- **Remaining blockers:**
  1. Copilot often returns marketing chrome or partial patches (missing `*** End Patch`). `extractUnifiedDiff` therefore reports `selectedBlock: undefined` and the session stops after the first turn.
  2. Because the diff never materializes, `docs/CONTRACT.md` §4/§5 (diff emission + apply modes) are still unproven.
  3. We still *can’t* obtain a reusable headless GitHub session via Playwright automation—the auth helpers hit a passkey challenge. We’re piggybacking on the existing GUI Chrome profile via cookie copy instead.

Next operator should pick up from here:

1. Run the smoke command once to reproduce (`tmp/copilot-review-latest.log`, Chrome port printed near the top).
2. Use `scripts/browser-tools.ts eval --port <port> '…'` to inspect `div.markdown-body[data-copilot-markdown]` and see whether the diff is present somewhere in the DOM but hidden behind “View file” expanders.
3. Decide on a follow-up prompt or DOM scraping tweak to extract the `<code>` contents inside Copilot’s file preview block. Once we can read that, `extractUnifiedDiff` should succeed and the contract will be closer to fulfilled.

---

## 6. How to Unblock Auth (What a Human Must Do)

A future agent cannot fix this purely in code; a human with GitHub access and GUI access to the Ubuntu session must do **one** of the following:

### Option A – Reuse the actual logged‑in Chrome profile

1. On the Ubuntu GUI (not over SSH), in the Chrome where GitHub is logged in:
   - Open `chrome://version`.
   - Copy the **Profile Path** (e.g. `/home/graham/.config/google-chrome/Profile 1`).
2. In the Oracle repo:
   ```bash
   export CHROME_PROFILE_DIR="/home/graham/.config/google-chrome/Profile 1"  # use the real path
   set -o allexport; source .env; set +o allexport
   xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
   ```
3. If that still reports `❌ INVALID`, then GitHub is not treating that profile as authenticated in headless mode; see Option B.

### Option B – One manual login into the profile used by automation

1. On the Ubuntu GUI (physical or over VNC/RDP), start Chrome with the automation profile:
   ```bash
   /usr/bin/google-chrome \
     --user-data-dir="$HOME/.oracle/chrome-profile" \
     https://github.com/login
   ```
2. In that Chrome window:
   - Log into GitHub with username/password.
   - Complete 2FA (passkey, GitHub Mobile, authenticator app).
   - Visit `https://github.com/copilot?tab=chat` and confirm the **chat UI** loads.
   - Close Chrome.
3. Back in the repo:
   ```bash
   unset CHROME_PROFILE_DIR
   set -o allexport; source .env; set +o allexport
   xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
   ```
4. When this returns `✅ VALID` and `canUseOracle: true`, Copilot auth is truly unblocked for automation.

### Option C – Run Oracle’s browser engine on a machine with easier GUI

If the Ubuntu box cannot reasonably provide GUI/VNC, consider running the **browser engine** on the Mac (where Chrome + GitHub login already work) and using Ubuntu only for code/tests. That is a bigger structural decision and outside the scope of this file, but it’s worth noting.

---

## 7. Next Steps for a Fresh Agent

Assuming you (or another human) can meet one of the auth options above:

1. **Verify auth is truly good**
   - `xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick`
   - Expect: `overall: ✅ VALID`, `canUseOracle: true`.

2. **Run a Copilot POC**
   - `pnpm tsx scripts/use-authenticated-copilot.ts auth`
   - Expect: responses that clearly come from Copilot chat, not the marketing “Sign in” page.

3. **Finish the contract items**
   - Ensure Copilot DOM driver is robust (selectors for input, send, assistant responses).
   - Confirm `sessionRunner` and diff pipeline work end‑to‑end with Copilot responses.
   - Implement/verify `applyMode=commit` + branch/commit/push integration, using `scripts/committer` per repo guardrails.
   - Keep `docs/CONTRACT.md` and `README.md` in sync with any behavioral changes.

4. **Testing**
   - `pnpm test` and/or targeted tests around:
     - `diffExtractor`
     - `gitIntegration`
     - `assistantResponse` Copilot path
     - Auth validators (can be run against a mock profile).

---

## 8. TL;DR for the Next Agent

- The **code** for diff extraction, JSON output, and Copilot driver is largely in place.
- The **hard unresolved problem** is: getting a **headless Playwright Chrome** to see a **logged‑in GitHub/Copilot session** for this user on this Ubuntu box.
- The most realistic way forward is:
  - A human logs in once to GitHub/Copilot in the exact profile the automation uses,
  - `tmp/validate-auth-enhanced.ts` confirms `✅ VALID`,
  - Then you treat auth as “given” and focus on the rest of the contract.

Keep this file updated as you make progress; it's meant to be the single "what's actually going on here?" reference for future agents and humans.

---

## Update: Hang Fix & Model Selection Implementation (2025-11-18)

### Problem Solved
Fixed a critical hanging issue in `waitForCopilotResponse` where Oracle would hang for 10 minutes even when Copilot provided a complete response with markdown content.

**Root Cause:**
- Early return bug at line 405 that prevented other exit conditions from being evaluated
- Class-based selectors too fragile for dynamic GitHub DOM changes
- Missing fallback when scoped selectors failed
- No debugging for why chars=0 occurred despite visible content

### Solution Implemented
1. **Enhanced waitForCopilotResponse with fallback**:
   - Try scoped selection first, then fall back to last non-empty markdown body on page
   - Add immediate exit on send icon (airplane) + any non-zero markdown
   - Add comprehensive debugging with scope/global comparison logging

2. **Model Selection for GitHub Copilot**:
   - Created `src/browser/actions/copilotModelSelection.ts` to handle model picker
   - Updated `src/browser/index.ts` to use model selection instead of skipping it
   - Detects model selector button by class `ModelPicker-module__menuButton` and text "Model: GPT-5"
   - Allows switching from GPT-5 mini to full GPT-5

3. **Verification**
   - Created test scripts to verify hang fix (exits in 49ms vs 10 minutes)
   - Model selection extracting successfully from live Copilot session
   - Successfully extracts markdown content with unified diffs and code changes

### Key Verification Results
- Exit time: 49ms (fixed from 10-minute timeout)
- Extracted content: 914 characters with unified diff format
- Model selector detected: "Model: GPT-5 mini" button
- File references: `src/browser/actions/copilotNavigation.ts`
- Code changes: Shows `+` and `-` lines in proper patch format

### Current Status
The hang fix is working correctly. Model selection is implemented and detecting the UI. Next step is ensuring the session uses the full GPT-5 model instead of mini for longer responses.
