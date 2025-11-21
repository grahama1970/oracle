# Complete GitHub Copilot Authentication Guide for Headless Environments

> 🎯 **Summary**: This guide provides a comprehensive solution for authenticating to GitHub Copilot in headless Ubuntu/SSH environments. The core challenge is that critical auth cookies (`__Host-*`, `__Secure-*`) cannot be copied across domains due to Chrome security policies, requiring a fresh authentication flow.

## 🔍 Problem Analysis

### Why Cookie Copying Fails

GitHub uses strict security cookies:
- `user_session` → HttpOnly + Secure
- `__Host-user_session_same_site` → Host-only, no domain attribute
- `__Secure-next-auth.session-token` → Secure, HttpOnly

Chrome's sanitizer rejects any attempt to inject these programmatically across domains, so we must perform the actual login flow in-browser.

## ✅ Solutions Implemented

### Option 1: Automated Login with TOTP/2FA Support (RECOMMENDED)

**Perfect for CI/CD environments**
```bash
# Set credentials
export GITHUB_USERNAME="your-github-username"
export GITHUB_PASSWORD="your-github-password"
export GITHUB_TOTP_SECRET="YOUR-BASE32-SECRET"  # Optional for TOTP auth
# OR export GITHUB_OTP_CODE="123456"  # For SMS backup codes

# Run authentication
pnpm tsx scripts/authenticate-github-enhanced.ts

# Headless mode for CI
pnpm tsx scripts/authenticate-github-enhanced.ts --headless
```

**Features:**
- ⭐ Full TOTP 2FA automation with `otplib`
- ⭐ Handles device verification & security checkpoints
- ⭐ Validates access to Copilot chat interface after login
- ⭐ Persistent browser profile (reuse auth)
- ⭐ Robust DOM selectors (resilient to GitHub changes)

**Files:**
- `scripts/authenticate-github-enhanced.ts` - Main auth script with Playwright

---

### Option 2: Manual Profile Authentication + Validation

**Best for one-time setup**

1. **Manual login on GUI machine**
   ```bash
   google-chrome --user-data-dir=$HOME/.oracle/chrome-profile https://github.com/login
   ```
   - Log in completely (including any 2FA)
   - Navigate to `https://github.com/copilot?tab=chat`
   - Close browser to save session

2. **Validate the session**
   ```bash
   pnpm tsx tmp/validate-auth-enhanced.ts
   ```

3. **Test Copilot with Oracle**
   ```bash
   npx tsx scripts/copilot-poc.ts "Test Copilot integration"
   ```

**Files:**
- `tmp/validate-auth-enhanced.ts` - Comprehensive validation
- `tmp/export-session-cookies.js` - Export cookies for debugging

---

### Option 3: Session Recovery/Export

**For transferring auth between machines**
```bash
# Export session after manual login
pnpm tsx tmp/export-session-cookies.js export

# Test session validity
pnpm tsx tmp/export-session-cookies.js test
```

---

### Option 4: Browser Profile Reuse for CI/Docker

**For containerized environments**

```bash
# Build auth image with credentials
FROM ubuntu:22.04
RUN mkdir -p /opt/test-profile
COPY ./scripts/authenticate-github-enhanced.ts /auth.ts
ENV GITHUB_USERNAME="your-user"
ENV GITHUB_PASSWORD="your-pass"
RUN pnpm tsx /auth.ts --headless --profile=/opt/test-profile

# Store that profile in artifact for reuse
```

---

## 🚀 Quick Start Workflow

### For Local Development (GUI Available)

```bash
# 1. One-time auth (will open browser)
export GITHUB_USERNAME="steipete"
export GITHUB_PASSWORD="*******"
export GITHUB_TOTP_SECRET="ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP"  # Optional
pnpm tsx scripts/authenticate-github-enhanced.ts

# 2. Validate
pnpm tsx tmp/validate-auth-enhanced.ts

# 3. Use Oracle
npx tsx scripts/copilot-poc.ts "Implement secure authentication"
```

### For CI/CD (No GUI)

```bash
# Use XVFB for virtual display
sudo apt-get install -y xvfb

# Run periodically in CI
export GITHUB_USERNAME="${{ secrets.GITHUB_USERNAME }}"
export GITHUB_PASSWORD="${{ secrets.GITHUB_PASSWORD }}"
export GITHUB_TOTP_SECRET="${{ secrets.GITHUB_TOTP_SECRET }}"

# Virtual display for headless TOTP
xvfb-run -a pnpm tsx scripts/authenticate-github-enhanced.ts --headless

# Validate and save session for reuse
pnpm tsx tmp/validate-auth-enhanced.ts --headless --quick
mv ~/.oracle/chrome-profile /opt/chromium-profile.tar.gz  # Store artifact
```

---

## 🔒 Security Best Practices

1. **Environment Variables*
   ```bash
   export HISTCONTROL=ignoredups  # Prevent shell history
   unset HISTFILE
   export GITHUB_USERNAME="..."
   export GITHUB_PASSWORD="..."
   ```

2. **Profile Protection**
   ```bash
   chmod -R 700 ~/.oracle/chrome-profile
   ```

3. **TOTP Secret Storage**
   - NEVER commit Base32 secret to repo
   - Use GitHub Secrets or enterprise vault
   - Rotate frequently in production

4. **Session Expiration Handling**
   - GitHub sessions expire after ~30 days of inactivity
   - Monitor for re-auth needs with validation script
   - Set up automated weekly validation in CI

---

## 📋 Troubleshooting Guide

### Problem: "Sanitizing cookie failed" errors
**Cause**: Attempting to copy security cookies across domains
**Solution**: ❌ Don't copy cookies - perform real authentication flow

### Problem: "Marketing page instead of Copilot chat"
**Cause**: Missing auth cookies or expired session
**Solution**: Re-run authentication script

### Problem: TOTP code invalid or expired
**Cause**: Clock skew or wrong TOTP secret
**Solution**:
```bash
timedatectl status  # Check system time
# Verify TOTP secret with another authenticator app
```

### Problem: Automatically logged out after initiating script
**Cause**: GitHub detected suspicious device
**Solution**:
- Use a consistent user-agent
- Add `--disable-blink-features=AutomationControlled`
- Don't automate from cloud IPs without whitelisting

### Problem: Chrome crashes in CI
**Cause**: Memory issues, missing dependencies
**Solution**:
```bash
# Install required packages
sudo apt-get install -y xvfb libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

# Use proper virtual display
xvfb-run -s "-screen 0 1920x1080x24" pnpm tsx script.ts
```

---

## 🧪 Testing Your Setup

1. **Basic Authentication Test**
   ```bash
   npx tsx tmp/validate-auth-enhanced.ts
   # Expected: Overall: ✅ VALID
   ```

2. **Copilot-specific Test**
   ```bash
   npx tsx scripts/copilot-poc.ts "Summarize how neural networks work in one sentence"
   # Expected: Actual Copilot response, not marketing content
   ```

3. **Or <tool_use_error>File write failed: [