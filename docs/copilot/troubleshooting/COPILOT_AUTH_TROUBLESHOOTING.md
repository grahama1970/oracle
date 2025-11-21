# Copilot Auth Troubleshooting

Common symptoms
- Copilot opens marketing/landing page instead of chat.
- Model picker missing or disabled.
- `validate-auth-enhanced` reports Copilot not ready.

Quick fixes (in order)
1) Re-run quick validation headless:  
   `xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless`
2) Headful check and relogin using automation profile:  
   `google-chrome --user-data-dir="$HOME/.oracle/chrome-profile" https://github.com/login`  
   Then visit https://github.com/copilot?tab=chat and confirm chat input.
3) If SSH-only, use VNC (`vncserver :1`, tunnel 5901) and log in once, then rerun step 1.
4) Profile copy (last resort): copy a known-good `~/.oracle/chrome-profile` from another machine.

Root causes
- GitHub session expired / cookies rotated.
- Wrong profile used (missing `--user-data-dir`).
- Remote-debug port pointed at a different Chrome than the synced profile.

Persistence tips
- After a successful login, archive the profile:  
  `tar -czf copilot-auth.tgz -C $HOME .oracle/chrome-profile`
- Keep `CHROME_REMOTE_DEBUG_URL/PORT` consistent across runs if you reuse a live browser.
- Avoid simultaneous runs that might log out the session.
