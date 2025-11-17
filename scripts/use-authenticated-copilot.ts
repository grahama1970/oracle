/**
 * Example script: Using GitHub Copilot with authenticated session
 * This shows how to leverage authenticated browser profiles with Oracle
 */

import { runBrowserMode, type BrowserAutomationConfig } from '../src/browserMode.js';

/**
 * Example with GitHub credentials and TOTP support
 */
async function exampleWithFullAuth() {
  console.log('GitHub Copilot Automation with Full Authentication\n');

  // Configuration that will start with the saved Chrome profile
  const config: BrowserAutomationConfig = {
    // Use the authenticated profile directory
    chromeProfile: `${process.env.HOME}/.oracle/chrome-profile`,

    // Copilot endpoint
    url: 'https://github.com/copilot?tab=chat',

    // Ensure we connect to authenticated cookies
    cookieSync: true,

    // Headless mode for CI
    headless: false, // Set true for headless in CI

    // Keep browser for debugging
    keepBrowser: false,

    // Debug mode to see what's happening
    debug: true,

    // Allow some cookie errors (some will fail due to domain restrictions)
    allowCookieErrors: true,

    // Use your saved Chrome browser
    chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'
  };

  const prompts = [
    "How does GitHub Copilot work internally?",
    "What's the difference between GitHub Copilot and ChatGPT?",
    "Explain neural networks in simple terms."
  ];

  let successCount = 0;

  for (const prompt of prompts) {
    console.log(`\n=========== Query ${prompts.indexOf(prompt) + 1}/${prompts.length} ===========`);
    console.log(`Prompt: ${prompt}`);

    try {
      const result = await runBrowserMode({
        prompt,
        config,
        verbose: true,
        log: (msg) => console.log(`[oracle] ${msg}`)
      });

      console.log('\n--- Response ---');
      console.log(`Length: ${result.answerText.length} chars`);
      console.log('First 200 chars:');
      console.log(result.answerText.substring(0, 200) + '...');

      successCount++;

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error(`❌ Query ${prompts.indexOf(prompt) + 1} failed:`, error.message);

      // Give time before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n======== SUMMARY ========`);
  console.log(`Total queries: ${prompts.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${prompts.length - successCount}`);

  if (successCount > 0) {
    console.log('\n✅ Authentication is working correctly!');
    console.log('You can now integrate this into your CI/CD pipeline.');
  } else {
    console.log('\n⚠️  Seems like authentication issue. Run:');
    console.log('pnpm tsx tmp/validate-auth-enhanced.ts');
  }
}

/**
 * Example with fallback authentication (manual one-time setup)
 */
async function exampleWithFallbackAuth() {
  console.log('GitHub Copilot with Manual Auth + Fallback\n');

  // If you don't have GUI access, this approach:
  // 1. Use an existing Chrome profile you authenticated manually
  // 2. Or falls back to standard auth flow

  const config: BrowserAutomationConfig = {
    // Specify a profile directory that you authenticated manually
    chromeProfile: process.env.CHROME_PROFILE || `${process.env.HOME}/.chrome-profiles/authenticated`,

    url: 'https://github.com/copilot?tab=chat',
    cookieSync: true,
    headless: true,
    keepBrowser: false,
    debug: true,
    allowCookieErrors: true,
  };

  try {
    console.log('Testing Copilot with authenticated profile...');
    const result = await runBrowserMode({
      prompt: "What is the difference between static and instance methods in Python?",
      config,
      verbose: true
    });

    console.log('\n--- Copilot Response ---');
    console.log(`Status: Success`);
    console.log(`Length: ${result.answerText.length} chars`);
    console.log('\n' + result.answerMarkdown);

  } catch (error) {
    console.log('\nFallback auth failed - manual login may be needed');
    console.log('Solution: Run pnpm tsx scripts/authenticate-github-enhanced.ts');
  }
}

/**
 * Example for CI/CD integration
 */
async function exampleForCI() {
  console.log('GitHub Copilot CI Integration\n');

  // This is designed for GitHub Actions or similar CI/CD
  const config: BrowserAutomationConfig = {
    chromeProfile: process.env.CHROME_PROFILE || '/opt/authenticated-chrome-profile',
    url: 'https://github.com/copilot?tab=chat',
    cookieSync: true,
    headless: true,
    keepBrowser: false,
    debug: false, // Reduce output in CI
    allowCookieErrors: true,
    timeoutMs: 300000, // 5 min timeout for CI
  };

  const oracleMode = process.env.ORACLE_MODE || 'copilot';
  const promptText = process.env.ORACLE_PROMPT || '> Summarize the provided diff changes';

  try {
    console.log(`Mode: ${oracleMode}`);
    console.log(`Running: ${promptText.substring(0, 100)}...`);

    const result = await runBrowserMode({
      prompt: promptText,
      config,
      verbose: false
    });

    // Output in structured format for CI parsing
    console.log('::set-output name=status::success');
    console.log('::set-output name=response_length::' + result.answerText.length);
    console.log('::group::Oracle Response');
    console.log(result.answerMarkdown);
    console.log('::endgroup::');

  } catch (error) {
    console.error('::set-output name=status::failed');
    console.error('::error::Oracle failed:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('Oracle with GitHub Copilot Authentication Demo\n');

  const mode = process.argv[2] || 'example';

  try {
    switch (mode) {
      case 'auth':
        await exampleWithFullAuth();
        break;
      case 'fallback':
        await exampleWithFallbackAuth();
        break;
      case 'ci':
        await exampleForCI();
        break;
      default:
        console.log('Usage examples:\n');
        console.log('node use-authenticated-copilot.ts auth');
        console.log('  - Full authentication flow with TOTP support\n');
        console.log('node use-authenticated-copilot.ts fallback');
        console.log('  - Fallback to manual auth profile\n');
        console.log('node use-authenticated-copilot.ts ci');
        console.log('  - CI/CD integration example\n');
        console.log('Prerequisites:');
        console.log('- Set GITHUB_USERNAME, GITHUB_PASSWORD, (optional) GITHUB_TOTP_SECRET');
        console.log('- Or have an authenticated Chrome profile at ~/.oracle/chrome-profile');
    }
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Run: pnpm tsx tmp/validate-auth-enhanced.ts');
    console.log('2. If auth needed, run: pnpm tsx scripts/authenticate-github-enhanced.ts');
    console.log('3. Check ~/.oracle/chrome-profile directory exists');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Script error:', error);
    process.exit(1);
  });
}

export { exampleWithFullAuth, exampleWithFallbackAuth, exampleForCI };