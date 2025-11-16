# GitHub Copilot Authentication Guide for Oracle

## Current Status ✅

The infrastructure fix is **COMPLETE**. The `COOKIE_URLS` in `src/browser/constants.ts` now includes:
- `https://github.com`
- `https://copilot.github.com`
- `https://github.com/copilot`

## Why Authentication is Needed

GitHub Copilot's web interface requires GitHub authentication. The current Chrome profile contains GitHub cookies, but the key authentication cookies (`user_session`, `logged_in`, `__Host-user_session_same_site`) are empty.

## Manual Authentication Steps

### Option 1: Direct Chrome Authentication (Recommended)

1. **On a machine with GUI/Google Chrome installed**:
   ```bash
   # Launch Chrome with the same profile Oracle uses
   /usr/bin/google-chrome --user-data-dir="$HOME/.config/google-chrome/Default" https://github.com/login
   ```

2. **Authenticate manually**:
   - Enter your GitHub credentials
   - Complete any 2FA if required

3. **Navigate to GitHub Copilot**:
   - Once logged in, go to `https://github.com/copilot/`
   - Wait for the Copilot interface to load (not a marketing page)
   - Ensure you see the full Copilot chat interface

4. **Close Chrome cleanly** to save the session

5. **Verify authentication** by checking cookies:
   ```bash
   node tmp/simple-debug.js
   # Should show: Session Status: ✅ VALID
   ```

### Option 2: Profile Transfer (Advanced)

If you authenticated on a different machine:

1. **On the GUI machine**, after authentication:
   ```bash
   # Create a backup of the authenticated profile
   tar -czf chrome-authenticated.tar.gz ~/.config/google-chrome/Default
   ```

2. **Transfer the file** to your target environment

3. **Extract the profile**:
   ```bash
   # Backup current (empty) profile
   mv ~/.config/google-chrome/Default ~/.config/google-chrome/Default.backup

   # Extract authenticated profile
   tar -xzf chrome-authenticated.tar.gz -C ~/
   ```

4. **Verify** the authentication:
   ```bash
   node tmp/simple-debug.js
   ```

### Option 3: Using the Automated Scripts (if successful)

The repository includes these authentication helpers:
- `tmp/manual-login.js` - Puppeteer-based login (requires GUI)
- `tmp/auth-with-xvfb.js` - Headless authentication (may not work)
- `tmp/copilot-poc-manual.ts` - Manual auth with POC together

## Testing After Authentication

Once you have a valid session:

1. **Verify cookies**:
   ```bash
   node tmp/simple-debug.js
   # Look for: Session Status: ✅ VALID (ready for Copilot POC)
   ```

2. **Run the Copilot POC**:
   ```bash
   pnpm tsx scripts/copilot-poc.ts "How does GitHub Copilot work?"
   """

3. **Expected result**: You should see:
   - Copilot's actual chat interface (not a marketing page)
   - A meaningful response about Copilot
   - Response text instead of "Sign in or create a GitHub account"

## Troubleshooting

### If you still see the marketing page:

1. **Check authentication cookies**:
   ```bash
   node tmp/simple-debug.js
   ```

2. **Ensure you're logged in correctly**:
   - Visit `https://github.com/` in the authenticated profile
   - You should see your profile picture, not "Sign in"

3. **Check for organizational authentication**:
   - Some companies require additional SAML/SSO
   - Complete those steps if required

4. **Verify the correct profile**:
   ```bash
   # Check Chrome profile location
   pwd ~/.config/google-chrome/Default
   ```

## After Authentication - Next Steps

Once authentication is working:

1. **Test the Copilot POC again**
2. **Proceed with tightening the Copilot path** (removing ChatGPT-specific logic)
3. **Implement the diff pipeline for Copilot responses**
4. **Add commit + push automation**

## Quick Reference Commands

```bash
# Check current auth status
node tmp/simple-debug.js

# Run the Copilot POC
pnpm tsx scripts/copilot-poc.ts "Your prompt here"

# Deep cookie inspection
node tmp/inspect-github-session.js

# Manual login with Puppeteer
node tmp/manual-login.js  # Requires GUI
```

---

**The infrastructure is ready**. Only the manual authentication step remains to make the Copilot integration fully functional.