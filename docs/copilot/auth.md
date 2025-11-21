# GitHub Copilot Authentication Guide

Complete guide for authenticating Oracle's browser mode with GitHub Copilot across all environments.

## Quick Start (TL;DR)

**Profile location:** `$HOME/.oracle/chrome-profile`

**Quick validation:**
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```
Expected: `GitHub ✅, Copilot ✅ CHAT READY`

**If validation fails, see [Manual Authentication](#manual-authentication) below.**

---

## Overview

Oracle's browser mode needs an authenticated Chrome profile to access GitHub Copilot chat. The challenge:
- GitHub uses strict security cookies (`__Host-*`, `__Secure-*`) that cannot be copied programmatically
- A real browser login flow is required to establish session cookies
- Once authenticated, the profile can be reused indefinitely

**Two approaches:**
1. **Automated auth** (recommended for CI/CD) — uses Playwright + optional TOTP for 2FA
2. **Manual auth** (one-time setup) — human logs in via GUI or VNC, saves profile

---

## Automated Authentication (Recommended)

Use the enhanced auth script with optional TOTP support for fully automated authentication.

### Setup

Create a `.env` file in the repo root with your credentials:
```bash
GITHUB_USERNAME="your-github-username"
GITHUB_PASSWORD="your-github-password"
GITHUB_TOTP_SECRET="YOUR-BASE32-TOTP-SECRET"  # Optional for 2FA
CHROME_PATH="/usr/bin/google-chrome"          # Optional, defaults to this
CHROME_PROFILE_DIR="$HOME/.oracle/chrome-profile"  # Optional, uses automation profile
```

### Run Authentication

**Headful mode** (GUI available):
```bash
pnpm tsx scripts/authenticate-github-enhanced.ts
```

**Headless mode** (CI/CD, SSH-only):
```bash
xvfb-run -a pnpm tsx scripts/authenticate-github-enhanced.ts --headless
```

The script will:
1. Launch Chrome with persistent profile
2. Navigate to GitHub login
3. Fill credentials and submit
4. Handle 2FA if `GITHUB_TOTP_SECRET` is set
5. Navigate to Copilot chat and verify access
6. Save the authenticated session

### Validation

After authentication, verify the session:
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

Check the results:
```bash
cat tmp/auth-validation-results.json
```

Expected output:
- `"checks.github.authenticated": true`
- `"status.overall": "✅ VALID"`
- `"status.canUseOracle": true`

---

## Manual Authentication

When automated auth isn't feasible (passkey required, no TOTP, etc.), do a one-time manual login.

### Option 1: GUI Available (Easiest)

If you have desktop access or can launch GUI apps:

```bash
google-chrome --user-data-dir="$HOME/.oracle/chrome-profile" https://github.com/login
```

**Steps:**
1. Log in with your GitHub credentials
2. Complete 2FA (passkey, GitHub Mobile, authenticator app, SMS)
3. Navigate to `https://github.com/copilot?tab=chat`
4. Verify you see the chat interface (not marketing page)
5. Close the browser

**Validate:**
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

### Option 2: Pure SSH (No Desktop) — VNC

If you only have terminal access:

**Install VNC server:**
```bash
sudo apt-get update
sudo apt-get install -y tigervnc-standalone-server tigervnc-tools
```

**Start VNC session:**
```bash
vncserver -geometry 1920x1080 :1
# Enter a password when prompted
```

**Create SSH tunnel from your local machine:**
```bash
ssh -L 5901:localhost:5901 user@your-server-ip
```

**Connect VNC client** to `localhost:5901` on your local machine.

**Inside the VNC desktop:**
```bash
google-chrome https://github.com/login
```

Complete the login flow as in Option 1, then validate.

**VNC troubleshooting:**
```bash
# Check running sessions
vncserver -list

# Kill and restart if needed
vncserver -kill :1
vncserver -geometry 1920x1080 :1
```

### Option 3: Profile Transfer (Last Resort)

If you cannot get GUI access on the target machine, authenticate on a machine you control and copy the profile.

**On machine with GUI (after completing manual auth):**
```bash
tar -czf github-auth-profile.tgz -C $HOME .oracle/chrome-profile
scp github-auth-profile.tgz user@target-machine:/tmp/
```

**On target machine:**
```bash
tar -xzf /tmp/github-auth-profile.tgz -C $HOME
```

**Validate:**
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

---

## Using Existing Chrome Profile

If you already have Chrome logged into GitHub on your machine, you can reuse that profile instead of `~/.oracle/chrome-profile`.

**Find your profile path:**
```bash
google-chrome --version
# Open chrome://version in the browser
# Copy the "Profile Path" (e.g., /home/user/.config/google-chrome/Profile 1)
```

**Set environment variable:**
```bash
export CHROME_PROFILE_DIR="/home/user/.config/google-chrome/Profile 1"
```

**Validate:**
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

Oracle will now use this profile for browser runs.

---

## Remote Debugging (Alternative to Cookie Sync)

Instead of copying cookies/profiles, connect to a running Chrome instance. More robust across platforms.

**Launch Chrome with remote debugging:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.oracle/chrome-profile"
```

**Keep this Chrome window open**, then tell Oracle to connect:
```bash
export CHROME_REMOTE_DEBUG_URL="http://127.0.0.1:9222"
# or
export CHROME_REMOTE_DEBUG_PORT="9222"
```

**Run Oracle:**
```bash
oracle --engine browser --browser-no-cookie-sync --prompt "..." --model gpt-5
```

Oracle will attach to the running browser instead of launching a new instance.

**Benefits:**
- No cookie encryption/decryption issues
- Works identically on Windows, Mac, Linux
- No profile path/lock file conflicts

---

## Post-Authentication Checklist

After any authentication method, verify everything works:

### 1. Quick Validation
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

Expected output:
```
GitHub auth: ✅ Authenticated
Copilot access: ✅ CHAT READY
overall: ✅ VALID
canUseOracle: true
```

### 2. Test Copilot Access
```bash
xvfb-run -a pnpm tsx scripts/copilot-poc.ts "Hello Copilot"
```

Should return a response from Copilot (not a marketing page redirect).

### 3. Save Your Profile
After successful authentication, back up the profile:
```bash
tar -czf oracle-chrome-profile-backup.tgz -C $HOME .oracle/chrome-profile
```

Restore if needed:
```bash
tar -xzf oracle-chrome-profile-backup.tgz -C $HOME
```

---

## Troubleshooting

### Marketing Page Instead of Chat
**Cause:** Not authenticated or session expired.

**Fix:** Re-run authentication (automated or manual).

### Missing Model Picker
**Cause:** Copilot chat page not fully loaded or not authenticated.

**Fix:** 
1. Validate auth: `xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick`
2. If invalid, re-authenticate
3. Try headful mode to inspect: `pnpm tsx scripts/copilot-poc.ts "test"`

### Passkey/GitHub Mobile Blocks Automation
**Cause:** GitHub requires device-specific 2FA that cannot be automated.

**Fix:** Use [Manual Authentication](#manual-authentication) once, then reuse the profile.

### Chrome Crashes on Launch
**Cause:** Insufficient shared memory or missing dependencies.

**Fix:** Add Chrome flags:
```bash
export CHROME_FLAGS="--disable-dev-shm-usage --no-sandbox --disable-gpu"
```

Or run with xvfb:
```bash
xvfb-run -a pnpm tsx scripts/authenticate-github-enhanced.ts
```

### Low Memory Issues
**Fix:** Disable unnecessary Chrome features:
```bash
export CHROME_FLAGS="--disable-gpu --disable-extensions --disable-background-timer-throttling"
```

### VNC Connection Refused
```bash
# Check if VNC is running
vncserver -list

# Start if not running
vncserver :1

# Check firewall
sudo ufw allow 5901
```

### Cookie Path Not Found
**Cause:** `chrome-cookies-secure` expects `Cookies` database at specific path.

**Fix:** Oracle automatically handles this, but if you see errors:
- Playwright stores cookies at: `<profile>/Default/Cookies`
- Standard Chrome uses: `<profile>/Cookies`

The code now tries both locations.

---

## Environment Variables Reference

```bash
# Required for automated auth
GITHUB_USERNAME="your-username"
GITHUB_PASSWORD="your-password"

# Optional
GITHUB_TOTP_SECRET="BASE32-SECRET"        # For TOTP 2FA automation
CHROME_PATH="/usr/bin/google-chrome"     # Chrome binary location
CHROME_PROFILE_DIR="$HOME/.oracle/chrome-profile"  # Profile directory
CHROME_REMOTE_DEBUG_URL="http://localhost:9222"    # Connect to existing Chrome
CHROME_REMOTE_DEBUG_PORT="9222"                    # Alternative to URL
```

---

## See Also

- `browser-mode.md` — Current Copilot browser behavior
- `smoke.md` — End-to-end smoke test checklist
- `troubleshooting.md` — Detailed troubleshooting for specific issues
- `legacy/GITHUB_COPILOT_AUTH_COMPLETE_GUIDE.md` — Original detailed auth guide
