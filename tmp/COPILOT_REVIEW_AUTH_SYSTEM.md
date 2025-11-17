<!--
  Copilot review request for the Oracle auth + Copilot browser integration.
  Follows the structure of docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md.
-->

# Review Oracle's GitHub Copilot authentication + browser integration

## Repository and branch

- **Repo:** `steipete/oracle`
- **Branch:** `feat/copilot-auth-review`
- **Paths of interest:**
  - `scripts/authenticate-github-enhanced.ts`
  - `tmp/validate-auth-enhanced.ts`
  - `src/browser/cookies.ts`
  - `src/browser/actions/copilotNavigation.ts`
  - `src/browser/constants.ts`
  - `src/cli/browserConfig.ts`
  - `scripts/copilot-poc.ts`
  - `scripts/use-authenticated-copilot.ts`
  - `scripts/copilot-code-review.ts`
  - `AUTHENTICATION_SOLUTION_SUMMARY.md`

## Summary

This Oracle fork adds a full GitHub + Copilot authentication flow and a
Copilot-specific browser engine path:

1. `scripts/authenticate-github-enhanced.ts` (Playwright + TOTP) logs into GitHub,
   handles 2FA, and verifies Copilot chat access in a persistent Chrome profile.
2. `tmp/validate-auth-enhanced.ts` validates that a profile is:
   - Authenticated to GitHub, and
   - Able to reach the Copilot chat UI (not just the marketing page).
3. `src/browser/cookies.ts` now resolves Chrome cookie paths correctly for
   Playwright-style profiles (falling back from `<profile>/Cookies` to
   `<profile>/Default/Cookies`).
4. `src/browser/actions/copilotNavigation.ts` contains Copilot-specific DOM
   drivers for:
   - Navigating to Copilot,
   - Detecting authentication/marketing pages,
   - Finding the Copilot chat input
     (including the new `#copilot-chat-textarea` / “Ask anything” UI),
   - Waiting for Copilot responses.
5. `src/cli/browserConfig.ts` / `src/browser/constants.ts` ensure that browser
   runs targeting `gpt-5.1` select the **GPT‑5** picker label in the ChatGPT UI.
6. `scripts/copilot-poc.ts` and `scripts/copilot-code-review.ts` are small proof
   of concept scripts that:
   - Reuse the authenticated profile (`~/.oracle/chrome-profile`),
   - Talk to GitHub Copilot Web via the browser engine,
   - Use GPT‑5 by default for browser runs.
7. `AUTHENTICATION_SOLUTION_SUMMARY.md` documents the Ubuntu-specific auth
   issues (networkidle timeouts, login detection, selector drift, cookie paths)
   and the concrete fixes that led to a stable `✅ VALID` validation result.

Copilot’s job is to:

- Review the new authentication + browser integration flow for correctness,
  robustness, and maintainability.
- Call out any brittle DOM selectors, implicit assumptions, or edge cases
  (e.g., GitHub UI changes, 2FA flows, profile corruption).
- Suggest improvements to error handling, test coverage, documentation, and
  CLI ergonomics, especially around `--engine browser` + Copilot + GPT‑5.
- If appropriate, propose concrete code changes as unified diffs, following the
  constraints below.

## Objectives

1. **Authentication robustness**
   - Confirm that the enhanced auth script and validator handle real-world
     GitHub flows (login, 2FA, passkeys/GitHub Mobile as far as possible)
     without flakiness or hidden assumptions.
   - Identify any places where we should fail fast vs. retry vs. instruct the
     operator (e.g., detecting when GitHub demands a fresh device verification).

2. **Copilot DOM driver resilience**
   - Evaluate the selectors and heuristics in `copilotNavigation.ts` for:
     - Detecting authenticated vs marketing/auth walls.
     - Finding the chat input (`#copilot-chat-textarea`, “Ask anything”, etc.).
     - Waiting for responses without hanging indefinitely.
   - Propose safer fallbacks or feature checks for future Copilot UI changes.

3. **Chrome profile + cookie handling**
   - Review the cookie sync behavior in `src/browser/cookies.ts` to ensure:
     - We don’t accidentally copy sensitive cookies to the wrong context.
     - We are robust to profile layout differences (`Default` vs top-level).
     - Errors are surfaced clearly but can be overridden when desired.

4. **CLI ergonomics and model selection**
   - Confirm that the `--model` flag behavior for browser runs is sensible:
     - `gpt-5.1` → GPT‑5 picker label by default.
     - Descriptive labels (`"GPT-5 Instant"`) still work as overrides.
   - Suggest improvements to how the CLI exposes Copilot (e.g., a `--copilot`
     flag, clearer help text) while keeping API behavior unchanged.

5. **Documentation and troubleshooting**
   - Review `AUTHENTICATION_SOLUTION_SUMMARY.md` for clarity and correctness.
   - Suggest any missing troubleshooting steps or gotchas we should capture.

## Constraints for the patch

- **Output format:** Unified diff only, inline inside a single fenced code block.
- Include a one-line commit subject on the first line of the patch.
- Hunk headers must be numeric only (`@@ -old,+new @@`); no symbolic headers.
- Patches must apply cleanly on the current branch of this repo.
- Do not introduce new dependencies or change build tooling.
- No extra commentary, hosted links, or PR creation in the output.

## Acceptance criteria

- Enhanced auth + validator scripts can reliably produce:
  - `"authenticated": true` for GitHub, and
  - `"overall": "✅ VALID", "canUseOracle": true` in `tmp/auth-validation-results.json`
    when the profile is authenticated.
- Copilot POC + code-review scripts can:
  - Reuse `~/.oracle/chrome-profile` without cookie path errors,
  - Reach `https://github.com/copilot?tab=chat`,
  - Select GPT‑5 when requested for browser runs, and
  - Obtain real Copilot responses (not the marketing page).
- Browser engine behavior for non-Copilot ChatGPT flows remains unchanged.

## Test plan

1. Run `pnpm tsx scripts/authenticate-github-enhanced.ts` headful and complete
   2FA manually (GitHub Mobile or authenticator).
2. Validate the session:
   ```bash
   xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
   cat tmp/auth-validation-results.json
   ```
3. Sanity-check Copilot:
   ```bash
   export CHROME_PROFILE_DIR="$HOME/.oracle/chrome-profile"
   export CHROME_PATH="/usr/bin/google-chrome"
   pnpm tsx scripts/copilot-poc.ts "Test Copilot integration from Oracle"
   ```
4. Run this code-review flow:
   ```bash
   pnpm tsx scripts/copilot-code-review.ts tmp/COPILOT_REVIEW_AUTH_SYSTEM.md
   ```
5. Apply any accepted diffs via `scripts/committer` and re-run the tests above.

## Implementation notes

- Keep Playwright + Chrome options conservative (avoid fragile flags).
- Prefer avatar-based login detection over brittle “Sign out” links.
- Keep Copilot selectors explicit but layered with safe fallbacks.
- Avoid changing unrelated API behavior or CLI flags.

## Clarifying questions

1. Are you comfortable relying on `~/.oracle/chrome-profile` as the canonical
   automation profile for both GitHub and Copilot, or should we add explicit
   support for multiple profiles (e.g., `--browser-chrome-profile copilot`)?
2. Should Copilot browser runs always target GPT‑5 by default, or should they
   respect the CLI `--model` flag even when pointed at `github.com/copilot`?
3. Do you want stricter failure behavior (non-zero exit) when Copilot selectors
   drift and we fall back to heuristic detection, or is the current “warn and
   proceed” behavior acceptable?

## Deliverable

Reply with:

- A single fenced code block containing a unified diff that meets the
  constraints above (you may include multiple file hunks inside the same
  patch), and
- Answers to the clarifying questions above, written outside of the diff
  block so they are easy to review.
