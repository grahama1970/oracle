#!/usr/bin/env node

/**
 * Validate current GitHub authentication status
 * This checks what GitHub cookies we have and tests Copilot access
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { launchChrome, connectToChrome } from '../src/browser/chromeLifecycle.js';
import { syncCookies } from '../src/browser/cookies.js';
import { checkCopilotAuthentication } from '../src/browser/actions/copilotNavigation.js';
import { validateGitHubCookies } from '../src/browser/actions/githubAuth.js';

const logger = (msg) => console.log(`[validate] ${msg}`);

async function validateGitHubAuth() {
  logger('Starting GitHub authentication validation...');
  console.log('');

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'oracle-validate-'));
  const chrome = await launchChrome({
    chromeProfile: 'Default',
    headless: false, // Use GUI to show what's happening
    hideWindow: true,
    keepBrowser: false,
    debug: true,
  }, userDataDir, logger);

  let client;
  try {
    client = await connectToChrome(chrome.port, logger);
    const { Network, Page, Runtime } = client;

    await Page.enable();
    await Network.enable();
    await Runtime.enable();

    // Clear previous cookies to test fresh
    await Network.clearBrowserCookies();

    // Sync cookies from Chrome profile (what happens normally)
    const cookieCount = await syncCookies(
      Network,
      'https://github.com',
      'Default',
      logger,
      true // Allow errors to see what's failing
    );

    console.log('');
    console.log('=== COOKIE SYNC RESULT ===');
    console.log(`Copied ${cookieCount} cookies from Chrome profile`);
    console.log('');

    // Navigate to GitHub to check auth status
    logger('Checking GitHub authentication status...');
    await Page.navigate({ url: 'https://github.com' });
    await delay(3000);

    // Validate cookies
    const cookieValidation = await validateGitHubCookies(Runtime, logger);

    console.log('=== COOKIE VALIDATION ===');
    console.log(`Cookie validation: ${cookieValidation.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`Critical cookies found: ${Object.keys(cookieValidation.cookies).length}`);
    console.log(`Missing: ${cookieValidation.missing.join(', ')}`);
    console.log('');

    // Navigate to Copilot
    logger('Testing Copilot access...');
    await Page.navigate({ url: 'https://github.com/copilot/' });
    await delay(4000);

    // Check copilot authentication specifically
    const isAuthenticated = await checkCopilotAuthentication(Runtime, logger);

    console.log('=== COPILOT AUTHENTICATION ===');
    console.log(`Copilot auth: ${isAuthenticated ? '✅ AUTHENTICATED' : '❌ NEEDS AUTH'}`);

    if (!isAuthenticated) {
      console.log('🔍 Current page info:');
      const pageInfo = await Runtime.evaluate({
        expression: `({
          title: document.title,
          hasChatInput: !!document.querySelector('textarea[placeholder*="Ask Copilot"]'),
          hasMarketingLinks: !!document.querySelector('a[href*="signup"], a[href*="login"]'),
          url: window.location.href
        })`,
        returnByValue: true
      });

      const info = pageInfo.result.value;
      console.log(`  Page title: ${info.title}`);
      console.log(`  Has chat input: ${info.hasChatInput}`);
      console.log(`  Has marketing links: ${info.hasMarketingLinks}`);
      console.log(`  Current url: ${info.url}`);
    }

    console.log('');

    // Final results
    if (cookieValidation.valid && isAuthenticated) {
      console.log('🎉 SUCCESS: GitHub authentication is complete!');
      console.log('You should be able to use Copilot in Oracle.');
      return { status: 'valid', auth: 'authenticated' };
    } else if (cookieValidation.valid && !isAuthenticated) {
      console.log('👍 PARTIAL: GitHub cookies are valid but Copilot needs access');
      console.log('Copilot might need to be granted access or be in beta program.');
      return { status: 'partial', auth: 'needs-copilot-access' };
    } else {
      console.log('❌ NEEDS AUTH: GitHub authentication required');
      console.log('Run: pnpm tsx scripts/authenticate-github.ts');
      return { status: 'invalid', auth: 'needs-github-auth' };
    }

  } catch (error) {
    console.error('Validation error:', error);
    return { status: 'error', auth: 'error' };
  } finally {
    await client?.close();
    chrome.kill();
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run directly
if (process.argv[1] === import.meta.url) {
  validateGitHubAuth().then(result => {
    console.log('\\nValidation complete:', result);
    process.exit(result.status === 'valid' ? 0 : 1);
  }).catch(error => {
    console.error('Failed to validate:', error);
    process.exit(1);
  });
}

// Export for use in other scripts
export { validateGitHubAuth }
export default validateGitHubAuth;