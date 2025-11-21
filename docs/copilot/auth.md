# Copilot Auth (Concise)

- Use the logged-in Chrome profile: `$HOME/.oracle/chrome-profile`.
- Preferred: run `tmp/validate-auth-enhanced.ts --quick` to confirm GitHub + Copilot chat ready.
- Browser mode uses cookie sync unless remote-debug is provided; set `CHROME_REMOTE_DEBUG_URL/PORT` to reuse a live browser.
- Manual login (if needed): follow legacy `GITHUB_COPILOT_AUTH_COMPLETE_GUIDE.md`; do one manual login into the automation profile, then reuse.
- Troubleshooting (brief):
  - If Copilot shows marketing page: re-login via profile.
  - If model picker missing: ensure auth and reload; use headful run to inspect.
  - If 2FA/passkey blocks: perform manual login once and reuse the profile; archive the profile if needed.
