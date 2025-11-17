# Manual GitHub Authentication Guide for Headless Environments

## 🎯 Objective

Since automated 2FA attempts fail at the Passkey/GitHub Mobile approval stage, we need to perform **one manual login** into the automation profile, then reuse that authenticated session permanently.

## 🚨 The Exact Situation You're Facing

1. **Username/password submit**: ✅ Works in headless
2. **GitHub 2FA redirect**: ✅ Detected by script
3. **Passkey/GitHub Mobile prompt**: ❌ No OTP input field available
4. **Result**: Chrome waits indefinitely, script times out

**GitHub is intentionally designed this way** - passkeys cannot be automated without physical security keys or mobile devices.

## ✅ Solution: One Manual Login, Permanent Benefit

**Pick the option that matches your available access method below, then route through that exact GUI path once.** Afterwards all headless automation will reuse the session.

---

## Option A — Ubuntu Desktop / Physical Console (Simplest)

If your Ubuntu box has a monitor or you can VNC/SSH-X forwards to a desktop, do this:

```bash
# 1. Use the automation profile directory we created
firefox \\
  --new-instance \\
  --profile /home/graham/.oracle/chrome-profile \\
  https://github.com/login &
```

> Any modern browser works; Firefox is lightweight.

- Log in (username + password)
- Complete whatever 2-factor GitHub shows: passkey tap on phone, GitHub Mobile “Sign In” button, or TOTP 6-digit code
- When you land at https://github.com, open a **new tab** and browse to:
  `https://github.com/copilot?tab=chat`
- If you see the blue chat compose box (hint: “Ask Copilot…”), you’re authenticated to Copilot Web.
- Close Firefox completely (so cookies write to disk / sync).

That single browser shutdown commits the cookies/token. Now validate from SSH:

```bash
cd /home/graham/workspace/experiments/oracle
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick
# Expected: ✅ VALID  canUseOracle: true
```

---

## Option B — Remote Ubuntu with TigerVNC (No Physical Console)

### 1. Install VNC (one-time)
```bash
sudo apt update
sudo apt install -y tigervnc-standalone-server tigervnc-tools
vncserver -geometry 1600x900 :1
# (type and remember the password – you will access it from your local viewer)
```

### 2. On Local Laptop / Desktop
```bash
ssh -L 5901:localhost:5901 yourUser@yourServerIP
# Keep that terminal open (tunnel).
```

Open the *local* TigerVNC app or `vncviewer` and punch in:
`localhost:5901`  (use the password you set above).

After the desktop appears: double-click **Firefox**, then go to `https://github.com/login`. Complete login exactly as written in Option A, sub-step 4. Close the window; disconnect VNC.

### 3. Confirm on the server
```bash
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick
```

---

## Option C — Cloud VM without any GUI stack (e.g. a Docker node in CI)

You **must** copy the authenticated chromium profile **from a machine you do own and can touch**.
Do the steps in Option B on your laptop, then tar-ball the profile:

On your personal Ubuntu / macOS / Windows + WSL:

```bash
# (anywhere you logged in successfully)
tar -czf /tmp/chromium-auth.tgz -C $HOME/.oracle .    # be sure you see Copilot chat
```

Cloud VM: upload `chromium-auth.tgz` via scp, S3, or artifacts & extract onto the same path:

```bash
mkdir -p ~/.oracle
# place the file and
tar -xzf chromium-auth.tgz -C ~/.oracle
```

Finally run `./tmp/validate-auth-enhanced.ts` **inside your container**; confirm ✅ VALID.

---

## Post-Authentication Checklist

Regardless of the option above, confirm the Copilot UI shows in an isolated test:

```bash
# ✓  GitHub authenticated
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
#                  must print: overall: ✅ VALID  chatAvailable: true

# ✓  Oracle now lands in chat, not marketing page
xvfb-run -a pnpm tsx scripts/copilot-poc-ts "Steipete is using Copilot via Oracle"
#        should return an actual Copilot reply instead of the marketing text.
```

---

## Backing-up / Restoring the Authced Profile (for CI)

After a successful manual run, archive the exact tree named in the scripts for posterity:

```bash
cd $($HOME)
chromium --profile-directory=/.oracle/chrome-profile https://github.com/copilot?tab=chat  # quick visual re-check
tar -czf github-copilot-oracle-profile.tgz .oracle/
```

Move that tarball to your secure share / artifact bucket. Recover any time:

```bash
tar -xzf github-copilot-oracle-profile.tgz -C ~
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick  ✅
```

Note: Chrome profile ~= 40–60 MB on disk.

---

## Session Reliability Notes

- A GitHub session lasts roughly 30 days of **non-idle** use. If Copilot calls become sparse, re-authorise a fresh profile manually (same one-time flow).
- **Do not run cloud jobs over residential proxies or Tor**. GitHub rapidly asks for re-login from those sources.
- If 2FA **changes device** (new phone “this is my *only* authenticator” step), repeat the manual login path and repackage that profile.

---

## Troubleshooting the Manual Flow

**Firefox refuses to go to Copilot at step 4** → switch to the equivalent Chrome binary package (`chromium-browser`) – the profiles are compatible.

**Profile file != the one the scripts read** → double-check environment:
```bash
echo $HOME/.oracle/chrome-profile  # must be the full path Firefox/Chrome actually used.
```

**Validation returns “NOT AUTHS” after the GUI login** → ensure the Galileo **specific** domain/file ended up written; then force-rerun the validator inside headless Chrome.

---

## Summary

**One manual login with a human hand** into the Oracle profile directory is all that is necessary. Once the script sees the chat box instead of “Sign In”, you’re past the rock. From that point forward Oracle will run headless using that persistent session, diff ⇒ apply ⇒ commit paths can proceed, and authenticated Copilot responses are available for any loops the agent has to complete.

Route through the 2FA (passkey or phone) once, archive that profile, use it forever in automation. ✅