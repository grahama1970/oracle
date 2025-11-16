#!/usr/bin/env tsx

/**
 * Manual authentication flow for Copilot POC
 * Opens Chrome in non-headless mode to allow manual GitHub login
 */

import { runBrowserMode, type BrowserAutomationConfig } from '../src/browserMode.js';

async function main() {
  const config: BrowserAutomationConfig = {
    // Use the same profile as the regular POC
    chromeProfile: 'Default',
    chromePath: '/usr/bin/google-chrome',
    // Navigate to GitHub login first, then Copilot
    url: 'https://github.com/copilot/',
    timeoutMs: 900_000,
    inputTimeoutMs: 30_000,
    // Copy cookies from desktop Chrome profile
    cookieSync: true,
    // Key difference: NOT headless, so user can interact
    headless: false,
    keepBrowser: false,
    hideWindow: false,
    desiredModel: null,
    debug: true,
    allowCookieErrors: true,
  };

  // You can customize this prompt
  const prompt = process.argv.slice(2).join(' ').trim() || "How does GitHub Copilot work? I'm testing the authenticated access.";

  console.log('═══ Copilot POC with Manual Authentication ═══');
  console.log('');
  console.log('🚀 About to open Chrome in visible mode for Copilot');
  console.log('📋 Please:');
  console.log('  1. Wait for the browser to open');
  console.log('  2. Log into GitHub if you see a login prompt');
  console.log('  3. Ensure Copilot loads (not a marketing page)');
  console.log('  4. Chrome will automatically perform the test');
  console.log('  5. When done, the browser will close and show results');
  console.log('');
  console.log('Press Ctrl+C to cancel before browser opens\n');

  // Give user a moment to read
  await new Promise(resolve => setTimeout(resolve, 3000));

  const log = (message?: string) => {
    if (typeof message === 'string') {
      console.log(message);
    }
  };

try {
    console.log('🖥️  Opening Chrome window...\n');
    const result = await runBrowserMode({
      prompt,
      attachments: [],
      config,
      log,
      heartbeatIntervalMs: 30_000,
      verbose: true,
    });

    console.log('\n--- Copilot POC Result ---');
    console.log(`Answer text length: ${result.answerText.length}`);
    console.log(`Answer markdown length: ${result.answerMarkdown.length}`);
    console.log('');
    console.log('Response received:');
    console.log(result.answerMarkdown || result.answerText || '(no response)');

    // Check if we got the marketing page
    const hasMarketingContent = result.answerText.includes('Sign in or create a GitHub account');
    if (hasMarketingContent) {
      console.log('\n⚠️  ⚠️  ⚠️  ');
      console.log('It appears you reached a marketing page instead of the authenticated Copilot interface.');
      console.log('This usually means:');
      console.log('  - You were not logged in to GitHub');
      console.log('  - The Chrome profile cookies were insufficient');
      console.log('  - Additional organizational authentication was required');
      console.log('');
      console.log('🔄 To retry authentication:');
      console.log('  1. Run: node tmp/manual-login.js');
      console.log('  2. Complete the login process');
      console.log('  3. Then run this script again');
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Copilot POC failed:', message);

    if (message.includes('WebSocket')) {
      console.log('');
      console.log('⚠️  Chrome may have closed unexpectedly.');
      console.log('Retry the process if necessary.');
    }
  }
}

void main().catch(console.error);