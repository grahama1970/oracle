# Oracle Copilot Fork – Working Context (Restart Guide)

This file captures the current state of the **`/home/graham/workspace/experiments/oracle`** repo so a new agent (or human) can restart work without re‑discovering everything. It is intentionally opinionated and practical.

Last updated: 2025‑11‑17

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

**Short version:**  
Headless Playwright runs cannot see a valid GitHub session in any profile we’ve pointed them at so far, even though GUI Chrome is logged in. Without a logged‑in session in a profile Playwright can reuse, `https://github.com/copilot?tab=chat` keeps behaving like a marketing/auth page.

Details:

- `CHROME_PROFILE_DIR` was pointed at:
  - `~/.oracle/chrome-profile` → never had a valid session.
  - `~/.config/google-chrome/Default` → validator still reports:
    - `GitHub login: ❌ INVALID`
    - `canUseOracle: false`
- The enhanced auth script **does**:
  - Submit username/password from `.env`.
  - Hit a 2FA / device challenge step.
  - In this account, that challenge often has **no traditional OTP input**, instead expecting a passkey / GitHub Mobile approval.
  - In headless mode (Xvfb), this cannot be automatically completed.
- Result:
  - `scripts/authenticate-github-enhanced.ts` frequently fails with:
    - `2FA required but no OTP input field found`, or
    - `Login validation failed - can not find sign-out link`.
  - `tmp/validate-auth-enhanced.ts --headless --quick` currently reports `❌ INVALID` for both the custom profile and `Default`.

This is a **GitHub 2FA / device trust** limitation, not just a missing export or selector. The code changes are mostly fine; the real issue is that there is no profile which is:

1. Authenticated to GitHub/Copilot, **and**
2. Usable by headless Chrome under Playwright without additional human action.

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

Keep this file updated as you make progress; it’s meant to be the single “what’s actually going on here?” reference for future agents and humans. 

