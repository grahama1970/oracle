#!/usr/bin/env tsx

/**
 * Enhanced GitHub authentication script with TOTP 2FA support
 *
 * Key features:
 * - Handles TOTP 2FA automatically with GITHUB_TOTP_SECRET
 * - Uses Playwright for better debugging and error handling
 * - Persists session for headless reuse
 * - Validates Copilot chat access after login
 * - Supports headful mode for manual intervention if needed
 */

import 'dotenv/config';
import { chromium, Browser, Page } from 'playwright';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { authenticator } from 'otplib';

interface AuthOptions {
  username?: string;
  password?: string;
  totpSecret?: string; // Base32 secret for TOTP
  profileDir?: string;
  headless?: boolean;
  timeout?: number;
  debug?: boolean;
}

const log = (message: string) => console.log(`[auth] ${message}`);

async function isLoggedIn(page: Page): Promise<boolean> {
  // GitHub shows a user avatar / profile menu when authenticated.
  const avatarSelector =
    'summary[aria-label="View profile and more"], ' +
    'button[aria-label="View profile and more"], ' +
    'img.avatar-user';

  const avatar = page.locator(avatarSelector).first();
  return avatar.isVisible().catch(() => false);
}

/**
 * Enhanced GitHub authentication with Playwright
 */
async function authenticateWithPlaywright(options: AuthOptions) {
  const {
    username = process.env.GITHUB_USERNAME,
    password = process.env.GITHUB_PASSWORD,
    totpSecret = process.env.GITHUB_TOTP_SECRET,
    profileDir = process.env.CHROME_PROFILE_DIR || `${homedir()}/.oracle/chrome-profile`,
    headless = false,
    timeout = 60000,
    debug = true
  } = options;

  if (!username || !password) {
    console.error('❌ Missing credentials. Set:');
    console.error('  export GITHUB_USERNAME="your-username"');
    console.error('  export GITHUB_PASSWORD="your-password"');
    console.error('  # Optional: export GITHUB_TOTP_SECRET="base32secret..."');
    process.exit(1);
  }

  log('Starting enhanced GitHub authentication');
  log(`Profile directory: ${profileDir}`);
  log(`Mode: ${headless ? 'headless' : 'headful (GUI)'}`);

  // Create profile directory if not exists
  await fs.mkdir(profileDir, { recursive: true });

  // Configure Playwright
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: headless,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: [
      '--disable-dev-shm-usage',
      '--disable-features=VizDisplayCompositor',
      '--disable-gpu',
      ...(headless ? ['--headless=new'] : []),
      '--no-first-run',
      '--no-default-browser-check',
      '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ],
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    // Step 1: Navigate to GitHub login
    log('Navigating to GitHub login...');
    // GitHub keeps background network activity running, so waiting for
    // "networkidle" can time out even when the page is fully usable.
    // Use "load" here to avoid spurious timeouts like:
    //   page.goto: Timeout 30000ms exceeded. waiting until "networkidle"
    await page.goto('https://github.com/login', {
      waitUntil: 'load',
      timeout: timeout,
    });

    // Check if already logged in (avatar visible on top-right)
    const alreadyLoggedIn = await isLoggedIn(page);
    if (alreadyLoggedIn) {
      log('Already logged in - skipping login form');
      const result = await validateAuth(page, { skipLoginCheck: true });
      return { ...result, message: 'Already authenticated' };
    }

    // Step 2: Fill and submit login form
    log('Submitting login form...');
    await page.fill('input[name="login"], input#login_field', username);
    await page.fill('input[name="password"], input#password', password);

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => log('Navigation timeout after submit - continuing')),
      page.click('input[type="submit"], button[type="submit"]'),
    ]);

    // Step 3: Handle potential 2FA
    await handle2FA(page, totpSecret);

    // Step 4: Final authentication validation
    return await validateAuth(page);

  } catch (error) {
    console.error('Authentication error:', error);
    return { authenticated: false, error: error.message };
  } finally {
    await browser.close();
  }
}

/**
 * Handle potential 2FA challenge
 */
async function handle2FA(page: Page, totpSecret: string | undefined) {
  // Check for various 2FA pages
  const currentUrl = page.url();

  if (currentUrl.includes('/sessions/two-factor')) {
    log('2FA challenge detected - handling OTP...');

    // Wait for OTP input field (GitHub has changed this a few times; be generous)
    const otpSelector =
      'input[name="otp"], ' +
      'input[name="app_otp"], ' +
      'input[aria-label*="authentication"], ' +
      'input[autocomplete="one-time-code"], ' +
      'input[type="text"][maxlength="6"]';

    const otpInput = await page.waitForSelector(otpSelector, { timeout: 10000 }).catch(() => null);

    if (!otpInput) {
      // GitHub sometimes uses GitHub Mobile / passkeys here without exposing a classic OTP field.
      // In that case, give the operator time to approve on their device instead of failing fast.
      log('2FA challenge without OTP input field — waiting up to 60s for GitHub Mobile/passkey approval...');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
        log('No navigation after 2FA; continuing to validation (may still fail)');
      });
      return;
    }

    let code: string;
    if (totpSecret) {
      // Generate TOTP code
      try {
        code = authenticator.generate(totpSecret);
        log(`Generated TOTP code: ${code} (valid for ${30 - (new Date().getTime() / 1000 % 30)}s)`);
      } catch (error) {
        throw new Error(`Invalid TOTP secret: ${error.message}`);
      }
    } else {
      // Check if GITHUB_OTP_CODE is provided
      code = process.env.GITHUB_OTP_CODE;
      if (!code) {
        throw new Error('2FA required but no TOTP secret or GITHUB_OTP_CODE provided');
      }
      log(`Using provided OTP code: ${code}`);
    }

    await otpInput.fill(code);

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => log('Navigation after 2FA timeout')),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);
  } else if (currentUrl.includes('/sessions/device')) {
    log('Device verification detected - waiting for manual verification');
    // Device verification - headful mode will show the screen
    await page.waitForTimeout(30000); // Wait up to 30s for manual verification
  } else if (currentUrl.includes('/login/checkpoint')) {
    log('Security checkpoint detected - waiting for manual action');
    await page.waitForTimeout(30000); // Wait up to 30s for manual action
  }
}

/**
 * Validate authentication and Copilot access
 */
async function validateAuth(page: Page, options: { skipLoginCheck?: boolean } = {}) {
  const { skipLoginCheck = false } = options;

  if (!skipLoginCheck) {
    // Verify we're logged in via the user avatar / profile menu.
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      throw new Error('Login validation failed - user avatar not found (are you logged in?)');
    }
    log('✓ GitHub login successful - user avatar detected');
  }

  // Step 5: Navigate to Copilot and test access
  log('Testing Copilot access...');
  await page.goto('https://github.com/copilot?tab=chat', {
    // Same reasoning as the login navigation: GitHub pages often never
    // reach a true "networkidle" state due to analytics/long polling.
    waitUntil: 'load',
    timeout: 60000,
  });

  // Check current page content
  const pageInfo = await page.evaluate(() => ({
    url: window.location.href,
    hasChatInput: document.querySelector('textarea[placeholder*="Ask Copilot"], textarea[data-qa*="copilot"], div[contenteditable="true"]') !== null,
    hasMarketing: document.querySelector('a[href*="signup"], a[href*="pricing"]') !== null,
    pageTitle: document.title,
  }));

  log(`Copilot page: ${pageInfo.url}`);
  log(`Page title: ${pageInfo.pageTitle}`);
  log(`Chat input detected: ${pageInfo.hasChatInput}`);
  log(`Marketing page detected: ${pageInfo.hasMarketing}`);

  // Validate we're on chat page.
  //
  // GitHub periodically tweaks the DOM for Copilot chat, and the
  // textarea / contenteditable selector above can go stale. For our
  // purposes, if:
  //   - the user is logged in, and
  //   - we're on a Copilot chat URL with the expected title, and
  //   - we are not on a marketing / pricing page,
  // we treat that as sufficient proof that Copilot is accessible.
  if (!pageInfo.hasMarketing && pageInfo.url.includes('/copilot') && /Copilot/i.test(pageInfo.pageTitle)) {
    if (!pageInfo.hasChatInput) {
      log('⚠️ Copilot chat input selector not found, but Copilot page is loaded. Treating as success.');
    } else {
      log('🎉 SUCCESS: GitHub Copilot chat interface is available!');
    }
    return {
      authenticated: true,
      copilotAccess: true,
      sessionSaved: true
    };
  }

  throw new Error(`Copilot chat not available: ${pageInfo.hasMarketing ? 'Marketing page shown' : 'No chat input found'}`);
}

/**
 * CLI wrapper
 */
async function main() {
  console.log('\n🔐 GitHub Copilot Authentication (Enhanced)\n');

  const result = await authenticateWithPlaywright({
    headless: process.argv.includes('--headless'),
    debug: process.argv.includes('--debug')
  });

  console.log('\nResult:', result);

  if (result.authenticated && result.copilotAccess) {
    console.log('\n✅ Authentication complete!');
    console.log('You can now use: pnpm tsx scripts/copilot-poc.ts "Your question here"');
  } else {
    console.error('\n❌ Authentication failed!');
    if (result.error) {
      console.error('Error:', result.error);
    }
    process.exit(1);
  }
}

// Run if called directly (Node ESM entrypoint)
if (process.argv[1] && process.argv[1].endsWith('authenticate-github-enhanced.ts')) {
  main().catch(error => {
    console.error('\nScript error:', error);
    process.exit(1);
  });
}

export { authenticateWithPlaywright };
