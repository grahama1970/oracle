# Manual Login from Terminal - Quick Guide

If you're in a terminal and need to authenticate, you have two approaches depending on your environment:

## 1. GUI Access Available (Recommended)

If you have a desktop environment or can install one:

```bash
# Install browser if not present
sudo apt update && sudo apt install -y firefox

# Use Firefox with the automation profile
google-chrome --user-data-dir="$HOME/.oracle/chrome-profile" https://github.com/login
```

**What to do:**
1. Log in with your GitHub account
2. Complete any 2FA required (passkey, GitHub Mobile, TOTP)
3. Navigate to https://github.com/copilot?tab=chat
4. Verify you see a chat interface (not marketing page)
5. Close the browser
6. Test with validation script:
   ```bash
   xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick
   ```

## 2. Pure SSH (No GUI) - VNC Approach

If you only have terminal access but need GUI:

```bash
# Install VNC server
sudo apt-get update
sudo apt-get install -y tigervnc-standalone-server tigervnc-tools

# Set VNC password
vncserver -geometry 1920x1080 :1
# Enter password when prompted

# On your local machine, create tunnel
ssh -L 5901:localhost:5901 your-user@your-server-ip
```

**Then on your local computer, connect VNC client to `localhost:5901`**

Inside the VNC desktop:
```bash
# Install browser
sudo apt-get install -y firefox

# Launch browser
firefox https://github.com/login
```

## 3. No GUI Available (Archive/Copy Method)

If you **cannot** get GUI access at all:

1. **On a machine you own with GUI**, authenticate using Chrome/Firefox
2. **Archive the profile**:
   ```bash
   tar -czf github-auth-profile.tgz -C $HOME .oracle/chrome-profile
   ```
3. **Copy to target machine**:
   ```bash
   scp github-auth-profile.tgz username@target-server:/tmp/
   ssh username@target-server
   ```
4. **Extract on target**:
   ```bash
   tar -xzf /tmp/github-auth-profile.tgz -C $HOME
   ```

## Verification After Manual Login

```bash
# Quick check (should show ✅ VALID)
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick

# Full verification
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts

# Test Copilot access
xvfb-run -a pnpm tsx scripts/copilot-poc.ts "Test message"
```

## Troubleshooting

**Chrome crashes on launch**:
```bash
export DISPLAY=:99
sudo apt-get install -y xvfb
xvfb-run -s "-screen 0 1920x1080x24" google-chrome
```

**Memory issues**:
```bash
# Add Chrome flags for low-memory environments
--disable-dev-shm-usage --disable-gpu --no-sandbox --disable-extensions --disable-background-timer-throttling --disable-backgrounding-occluded-windows
```

**VNC connection refused**:
```bash
# Check VNC is running
vncserver -list
# If not, start it
vncserver :1
```

## Summary

The key insight is: **GitHub Copilot authentication requires one manual login into the automation profile**. After that, you can use the authenticated session in headless mode forever.

Choose the option that matches your access level:
- **GUI available**: Use Chrome/Firefox directly (fastest)
- **SSH only**: Use VNC (proven approach)
- **No GUI possible**: Copy profile from another machine (last resort)

Once you complete manual authentication once, you're unblocked for all future headless automation. The validation script will confirm success with an overall ✅ VALID status.