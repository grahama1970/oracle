# Post Manual Authentication Checklist

After completing the manual GUI authentication as described in `MANUAL_AUTH_GUIDE.md`, use this quick checklist to confirm everything is working.

## Immediate Validation (30 seconds)

```bash
# 1. Verify session is marked as authenticated
cd /home/graham/workspace/experiments/oracle
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless
```

**Expected output:**
```
🔍 GitHub Authentication Validation
Profile directory: /home/graham/.oracle/chrome-profile
Mode: headless

=== GitHub Authentication Check ===
GitHub login: ✅ VALID
Current URL: https://github.com/
=== Copilot Access Check ===
Copilot access: ✅ CHAT READY
Page title: GitHub Copilot · GitHub (or similar)
Chat input found: Yes
=== Session Persistence ===
Auth marker: Optional (not present is OK - browser profile is primary)

=== OVERALL RESULT ===
✅ VALID
Can use Oracle: Yes
Summary: Ready for Oracle automation
```

## Quick Copilot Test (1 minute)

```bash
# 2. Test Copilot query
xvfb-run -a pnpm tsx scripts/copilot-poc.ts "Hello Copilot, this is a test message"
```

**Expected output indicators:**
- Shows