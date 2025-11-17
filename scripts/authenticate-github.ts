#!/usr/bin/env tsx

/**
 * GitHub OAuth authentication for Copilot in headless environment
 *
 * This script performs the actual GitHub login flow in Chrome browser
 * You can either:
 * 1. Provide GitHub username/password via environment variables
 * 2. Use Personal Access Token approach (if Copilot supports it)
 * 3. Extract session cookies for reuse
 */

import { launchChrome, connectToChrome } from '../src/browser/chromeLifecycle.js';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { syncCookies } from '../src/browser/cookies.js';

import { checkGitHubAuthStatus, authenticateToGitHub, validateGitHubCookies } from '../src/browser/actions/githubAuth.js';
import { hideChromeWindow } from '../src/browser/chromeLifecycle.js';

interface CGitHubAuthOptions {
  username?: string;
  password?: string;
  headless?: boolean;
  profile?: string;
  debug?: boolean;
}

async function main() {
  const options: CGitHubAuthOptions = {
    username: process.env.GITHUB_USERNAME || '',
    password: process.env.GITHUB_PASSWORD || '',
    headless: false, // Show browser so user can help if needed
    profile: process.env.CHROME_PROFILE || 'Default',
    debug: true,
  };

  if (!options.username || !options.password) {
    console.error('ERROR: Set GITHUB_USERNAME and GITHUB_PASSWORD environment variables');
    console.error('Example:');
    console.error('export GITHUB_USERNAME="your-username"');
    console.error('export GITHUB_PASSWORD="your-password"');
    console.error('\nThen run: pnpm tsx scripts/authenticate-github.ts');
    process.exit(1);
  }

  console.log('Starting GitHub authentication for Copilot...');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-github-auth-'));
  const chrome = await launchChrome({
    chromeProfile: options.profile,
    headless: options.headless,
    hideWindow: options.headless,
    keepBrowser: false,
    debug: options.debug,
  }, userDataDir, (msg) => console.log(`[auth] ${msg}`));

  let client;
  try {
    client = await connectToChrome(chrome.port, (msg) => console.log(`[auth] ${msg}`));
    const { Network, Page, Runtime } = client;

    await Page.enable();
    await Network.enable();
    await Runtime.enable();

    await Network.clearBrowserCookies();

    // Sync cookies from existing profile
    const cookieCount = await syncCookies(
      Network,
      'https://github.com',
      options.profile,
      (msg) => console.log(`[auth] ${msg}`),
      false // Don't allow errors
    );

    console.log(`[auth] Synced ${cookieCount} cookies`);

    // Try to authenticate to GitHub
    console.log(`[auth] Authenticating as ${options.username}...`);
    const authSuccess = await authenticateToGitHub(Page, Runtime, (msg) => console.log(`[auth] ${msg}`), {
      githubUsername: options.username,
      githubPassword: options.password,
      timeoutMs: 90000,
    });

    if (authSuccess) {
      console.log('[auth] ✓ GitHub authentication successful!');

      // Check authentication status
      const isAuthenticated = await checkGitHubAuthStatus(Runtime);
      console.log(`[auth] GitHub authenticated: ${isAuthenticated}`);

      // Extract critical cookies
      const cookieValidation = await validateGitHubCookies(Runtime, (msg) => console.log(`[auth] ${msg}`));

      console.log('\n=== COOKIE VALIDATION ===');
      console.log(`Valid cookies: ${Object.keys(cookieValidation.cookies).length}`);
      console.log(`Missing cookies: ${cookieValidation.missing.join(', ')}`);

      if (cookieValidation.valid) {
        console.log('✓ All critical GitHub cookies found!');

        // Extract user info
        const userInfo = await getGitHubUserInfo(Runtime, (msg) => console.log(`[auth] ${msg}`));
        if (userInfo.username) {
          console.log(`✓ Authenticated as: ${userInfo.username}`);
        }

        // Navigate to Copilot to test
        console.log('[auth] Testing Copilot access...');
        await Page.navigate({ url: 'https://github.com/copilot/' });
        await delay(5000);

        // Check if we see the chat interface instead of marketing page
        const copilotCheck = await Runtime.evaluate({
          expression: `(() => {
            const hasChatInput = document.querySelector('textarea[data-qa*="copilot"], textarea[placeholder*="Ask Copilot"]') !== null;
            const pageTitle = document.title;
            return {
              hasChatInput,
              pageTitle,
              isChat: pageTitle.includes('Copilot') && pageTitle.includes('GitHub')
            };
          })()`,
          returnByValue: true
        });

        console.log(`Copilot access: ${copilotCheck.result.value.hasChatInput ? '✓ Chat interface detected' : '✗ Marketing page'}`);
        console.log(`Page title: ${copilotCheck.result.value.pageTitle}`);

        if (copilotCheck.result.value.hasChatInput) {
          console.log('\n🎉 SUCCESS: You can now use Copilot with Oracle browser mode!');
          console.log('The authentication cookies are now in your Chrome profile.');
          console.log('\nNext: Run the Copilot POC script to test the full flow.');
        }

      } else {
        console.log('✗ Cookie validation failed');
        console.log('Missing cookies:', cookieValidation.missing.join(', '));
      }

    } else {
      console.error('[auth] ✗ GitHub authentication failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('[auth] Error:', error);
    process.exit(1);
  } finally {
    console.log('\n[auth] Authentication script complete');
    await client?.close();
    chrome.kill();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}