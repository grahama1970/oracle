/**
 * GitHub authentication helpers for headless Copilot usage
 */

import type { ChromeClient, BrowserLogger } from '../types.js';
import { delay } from '../utils.js';

/**
 * Critical GitHub cookies for authentication
 */
const GITHUB_AUTH_COOKIES = [
  'user_session',
  '__Host-user_session_same_site',
  '__Secure-next-auth.session-token',  // GH Copilot uses this
  'github_id',  // Ancillary session identifier
];

/**
 * Pre-authenticate to GitHub using GitHub credentials
 * This will handle the login flow in the browser
 */
export async function authenticateToGitHub(
  Page: ChromeClient['Page'],
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  options: {
    githubUsername: string;
    githubPassword: string;
    timeoutMs?: number;
  }
): Promise<boolean> {
  logger(`Authenticating to GitHub for ${options.githubUsername}...`);

  // Navigate to GitHub login page
  await Page.navigate({ url: 'https://github.com/login' });
  await delay(3000); // Wait for page load

  try {
    // Check if we need to authenticate
    const needsAuth = await Runtime.evaluate({
      expression: `(() => {
        const hasLoginForm = document.querySelector('input[name="login"], input[name="session[login]"]') !== null;
        const hasPassword = document.querySelector('input[name="password"], input[name="session[password]"]') !== null;
        return hasLoginForm && hasPassword;
      })()`,
      returnByValue: true
    });

    if (!needsAuth.result.value) {
      logger('Already authenticated or on different page');
      return true;
    }

    // Fill in username
    await Runtime.evaluate({
      expression: `
        const loginInput = document.querySelector('input[name="login"], input[name="session[login]"]');
        if (loginInput) {
          loginInput.value = '${options.githubUsername.replace(/'/g, "\\'")}';
          loginInput.dispatchEvent(new Event('input', { bubbles: true }));
          loginInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `
    });

    await delay(1000);

    // Fill in password
    await Runtime.evaluate({
      expression: `
        const passwordInput = document.querySelector('input[name="password"], input[name="session[password]"]');
        if (passwordInput) {
          passwordInput.focus();
          passwordInput.value = '${options.githubPassword.replace(/'/g, "\\'")}';
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `
    });

    await delay(1000);

    // Submit form
    await Runtime.evaluate({
      expression: `
        const form = document.querySelector('form[action*="/session"], form[action$="/login"]') ||
                    document.querySelector('input[name="login"]').closest('form');
        if (form) {
          form.requestSubmit();
        } else {
          // Fallback: click submit button
          const submitBtn = document.querySelector('input[type="submit"], button[type="submit"], button[data-testid*="login"]');
          if (submitBtn) submitBtn.click();
        }
      `
    });

    // Wait for navigation and potential 2FA
    await delay(5000);

    // Check if we're authenticated
    const isLoggedIn = await checkGitHubAuthStatus(Runtime);

    if (isLoggedIn) {
      logger('Successfully authenticated to GitHub ✓');
      return true;
    }

    // Check if we need 2FA
    const needs2FA = await Runtime.evaluate({
      expression: `(() => {
        const has2FAFields = document.querySelector('input[name="app_otp"], input[name="otp"], input[aria-label*="two-factor"]') !== null;
        const has2FAPrompt = document.body.textContent.includes('two-factor') || document.body.textContent.includes('authentication');
        return has2FAFields || has2FAPrompt;
      })()`,
      returnByValue: true
    });

    if (needs2FA.result.value) {
      logger('Two-factor authentication required - cannot proceed in headless mode');
      return false;
    }

    logger('Login failed - unknown error');
    return false;

  } catch (error) {
    logger(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Check GitHub authentication status
 */
export async function checkGitHubAuthStatus(
  Runtime: ChromeClient['Runtime']
): Promise<boolean> {
  const authCheck = await Runtime.evaluate({
    expression: `(() => {
      // Look for authenticated user indicators
      const userMenu = document.querySelector('[aria-label*="account"], [aria-label*="profile"], [data-ga-click*="account"]');
      const signoutButton = document.querySelector('a[href*="/logout"], button[data-test-selector*="logout"]');
      const profileImg = document.querySelector('img[alt*="profile"], .Header-link img');
      const userDisplayName = document.querySelector('.Header-link .text-white, [data-test-id="account-switcher"]');

      return !!(userMenu || signoutButton || profileImg || userDisplayName);
    })()`,
    returnByValue: true
  });

  return authCheck.result.value || false;
}

/**
 * Check for critical GitHub authentication cookies
 */
export async function validateGitHubCookies(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
): Promise<{
  valid: boolean;
  cookies: Record<string, string>;
  missing: string[];
}> {
  try {
    // Get the current URL to check cookies
    const { result: urlResult } = await Runtime.evaluate({
      expression: 'window.location.origin',
      returnByValue: true
    });

    const currentOrigin = urlResult.value || 'https://github.com';
    const cookieResults: Record<string, string> = {};
    const missing: string[] = [];

    // Check each critical cookie
    for (const cookieName of GITHUB_AUTH_COOKIES) {
      try {
        const cookieCheck = await Runtime.evaluate({
          expression: `document.cookie.split(';').find(c => c.trim().startsWith('${cookieName}='))?.split('=')[1] || ''`,
          returnByValue: true
        });

        const value = cookieCheck.result.value;
        if (value && value.length > 0) {
          cookieResults[cookieName] = value;
          logger(`Found GitHub auth cookie: ${cookieName}`);
        } else {
          missing.push(cookieName);
          logger(`Missing GitHub auth cookie: ${cookieName}`);
        }
      } catch (e) {
        missing.push(cookieName);
        logger(`Error checking ${cookieName}: ${e}`);
      }
    }

    return {
      valid: missing.length === 0,
      cookies: cookieResults,
      missing
    };
  } catch (error) {
    logger(`Error validating GitHub cookies: ${error}`);
    return {
      valid: false,
      cookies: {},
      missing: GITHUB_AUTH_COOKIES
    };
  }
}

/**
 * Try to extract GitHub user info from authenticated session
 */
export async function getGitHubUserInfo(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger
): Promise<{
  username?: string;
  name?: string;
}> {
  try {
    const userInfo = await Runtime.evaluate({
      expression: `(() => {
        // Look for user information in various places
        const profileLinks = document.querySelectorAll('a[href*="/@"]');
        for (const link of profileLinks) {
          const match = link.href.match(/\/(@[a-zA-Z0-9-]+)/);
          if (match) return { username: match[1] };
        }

        // Check meta tags
        const metaUser = document.querySelector('meta[name="octolytics-actor"]');
        if (metaUser) {
          const user = metaUser.getAttribute('content');
          if (user) return { username: user };
        }

        return {};
      })()`,
      returnByValue: true
    });

    return userInfo.result.value || {};
  } catch (error) {
    logger(`Could not extract GitHub user info: ${error}`);
    return {};
  }
}

/**
 * For headless operation with a GitHub Personal Access Token
 * Creates a Chrome extension to inject stored GitHub session
 */
export async function setupSessionFromExtension(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  githubSessionCookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expiry?: number;
  }>
): Promise<boolean> {
  logger('Setting up GitHub session from stored cookies...');

  try {
    for (const cookie of githubSessionCookies) {
      // Each cookie needs to be set individually using the Chrome DevTools Protocol
      logger(`Injecting cookie: ${cookie.name}`);

      await Runtime.evaluate({
        expression: `
          document.cookie = '${cookie.name}=${cookie.value}; domain=${cookie.domain}; path=${cookie.path}; ${cookie.secure ? 'secure;' : ''} ${cookie.httpOnly ? 'HttpOnly;' : ''}';
        `
      });
    }

    await delay(2000);

    // Navigate to GitHub to check auth
    await Runtime.evaluate({
      expression: 'window.location.href = "https://github.com";',
    });

    await delay(3000);

    const isAuthenticated = await checkGitHubAuthStatus(Runtime);

    if (isAuthenticated) {
      logger('Session injection successful');
      return true;
    } else {
      logger('Session injection failed');
      return false;
    }
  } catch (error) {
    logger(`Session injection error: ${error}`);
    return false;
  }
}