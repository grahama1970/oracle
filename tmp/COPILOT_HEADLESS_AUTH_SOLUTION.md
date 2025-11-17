# GitHub Copilot Headless Authentication Solution

## The Problem (Exact What's Blocking Me)

1. **Cookie Domain Sanitization**: Chrome blocks cross-domain cookie copying from `github.com` to `github.com/copilot/` due to security restrictions
2. **Missing Critical Auth Cookies**: The key ones are failing:
   - `user_session` ⬅ Missing from profile
   - `__Host-user_session_same_site` ⬅ Cookie sanitization failed
   - `__Secure-next-auth.session-token` ⬅ Cookie sanitization failed
3. **Landing on Marketing Page**: Without valid auth cookies, GitHub redirects to Copilot marketing page instead of chat interface
4. **Two-Factor Authentication Required**: Some accounts need 2FA which can't be solved purely headless

## Four Solutions for Headless Authentication

### **SOLUTION 1: Automated Browser Login (RECOMMENDED)**
This performs the actual GitHub login flow programmatically.

```bash
# Set your GitHub credentials
export GITHUB_USERNAME="your-github-username"
export GITHUB_PASSWORD="your-github-password"

# First authentication (can be interactive for 2FA)
pnpm tsx scripts/authenticate-github.ts

# This will:
# 1. Open Chrome browser (can be headful for 2FA interaction)
# 2. Navigate to GitHub login
# 3. Fill username/password automatically
# 4. Stay open briefly for any 2FA (if required)
# 5. Save session to Chrome profile
```

### **SOLUTION 2: Extract Session from Chrome Profile**
After manual authentication on GUI machine, extract the session.

```bash
# Step 1: Manual login on GUI machine
google-chrome --user-data-dir="$HOME/.config/google-chrome/Default" https://github.com/login

# Step 2: Navigate to https://github.com/copilot/
# Step 3: Close browser to persist session

# Step 4: Export the session
pnpm tsx tmp/export-session-cookies.js export

# Step 5: Verify session
pnpm tsx tmp/export-session-cookies.js test
```

### **SOLUTION 3: OAuth Device Flow**
For enterprise/CI environments with OAuth apps.

```typescript
// OAuth device flow implementation (if GitHub supports it for Copilot)
const deviceCode = await startDeviceAuth();
console.log(`Visit https://github.com/login/device and enter: ${deviceCode.user_code}`);
// Wait for user auth, then use device_access_token
```

### **SOLUTION 4: Chrome Extension-based Session Injection**
For permanent bot/account setup with stored credentials.

```typescript
// Chrome extension loads stored session cookies
// and injects them into github.com domain before copilot navigation
await injectGitHubSession(cookiesFromStorage);
```

## Updated Copilot Navigation with Headless Auth Support

```tsx
// In src/browser/index.ts
const isAuthenticated = await checkCopilotAuthentication(Runtime, logger);

if (!isAuthenticated) {
  // Try headless authentication flow
  const authSuccess = await attemptHeadlessAuth(Page, Runtime, logger, config);

  if (authSuccess) {
    // Retry authentication check
    logger('Retrying Copilot authentication after auto-login attempt...');
    // Wait a bit for session to establish
    await delay(2000);
    const retryAuth = await checkCopilotAuthentication(Runtime, logger);

    if (!retryAuth) {
      throw new Error('Auto-auth failed - please authenticate manually on a GUI machine first');
    }
  } else if (!config.headless) {
    // Give user time to authenticate manually in GUI mode
    logger('⚠️  GitHub authentication required');
    logger('Logging in programmatically or waiting for manual auth...');
    logger('The browser will remain open for 45 seconds for authentication');
    await new Promise(resolve => setTimeout(resolve, 45000));

    const finalCheck = await checkCopilotAuthentication(Runtime, logger);
    if (!finalCheck) {
      throw new Error('Authentication required - please authenticate and try again');
    }
  } else {
    // Headless mode - need better error message
    throw new Error(`GitHub authentication required for Copilot.
Options:
1. Run 'pnpm tsx scripts/authenticate-github.ts' first
2. Manual login on your machine, then export cookies
3. Set GITHUB_USERNAME and GITHUB_PASSWORD environment variables`);
  }
}
```

## Implementation Plan

### **Phase 1: Cookie Validation**
```typescript
// New function to validate GitHub auth cookies
const authValidation = await validateGitHubCookies(Runtime, logger);
if (authValidation.valid) {
  logger(`✓ GitHub auth valid (${Object.keys(authValidation.cookies).length} cookies)`);
} else {
  logger(`✗ Missing GitHub auth: ${authValidation.missing.join(', ')}`);
}
```

### **Phase 2: Bug Fix - Domain Restrictions**
```typescript
// Fix cross-domain cookie copying
const criticalCookies = await getCriticalGitHubCookies(localNetwork);
await injectCookiesForDomain(criticalCookies, 'https://github.com');
```

### **Phase 3: Auto-Login Flow**
```typescript
// Add programmatic login support
const authSuccess = await authenticateToGitHub(Page, Runtime, logger, {
  githubUsername: config.githubUsername,
  githubPassword: config.githubPassword,
  timeoutMs: 60000,
});
```

### **Phase 4: Session Persistence**
```typescript
// Export session for future use
if (authSuccess) {
  await exportGitHubSession(Network, Runtime);
  logger('✓ GitHub session saved for future headless runs');
}
```

## Testing Authentication

### **Test 1: Cookie Validation**
```bash
pnpm tsx tmp/validate-github-auth.js
```

### **Test 2: Session Export**
```bash
pnpm tsx tmp/export-session-cookies.js export
pnpm tsx tmp/export-session-cookies.js test
```

### **Test 3: Full Flow**
```bash
export GITHUB_USERNAME="testuser"
export GITHUB_PASSWORD="testpass"
pnpm tsx scripts/authenticate-github.ts

# Once authenticated:
pnpm tsx scripts/copilot-poc.ts "How does GitHub Copilot work?"
```

## Success Criteria

✅ **All Critical GitHub Auth Cookies Present**
✅ **Landing on Copilot Chat Interface Instead of Marketing Page**
✅ **Input Field for Prompts Found**
✅ **Copilot Responds with AI-generated Content**

The authentication is ABSOLUTELY possible in a headless environment - it just requires handling the GitHub login flow properly instead of trying to copy cookies across domains. In a GUI environment, we can do the full authentication automatically. In pure CI/headless environments, we'll need pre-authenticated session data or GitHub enterprise credentials.