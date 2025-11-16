#!/usr/bin/env node
/**
 * Manual GitHub login setup for Copilot authentication
 * Opens an interactive Chrome window to login and access Copilot.
 *
 * NOTE: We use puppeteer-core here because this repo already depends on
 * puppeteer-core, not the full puppeteer bundle.
 */

import puppeteer from 'puppeteer-core';

async function manualLogin() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     GitHub Authentication Setup for Copilot POC              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('🚀 Opening Chrome in interactive mode...');
  console.log('Please: ');
  console.log('  1. Log into GitHub when the page loads');
  console.log('  2. Navigate to https://copilot.github.com');
  console.log('  3. Keep the page open for a few seconds after login');
  console.log('  4. When you see Copilot UI, close the browser window\n');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: process.env.HOME + '/.config/google-chrome/Default',
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
    executablePath: '/usr/bin/google-chrome',
  });

  try {
    const pages = await browser.pages();
    const page = pages[0];

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('🌐 Navigating to GitHub login...');
    await page.goto('https://github.com/login', { waitUntil: 'networkidle0', timeout: 30000 });

    console.log('🔐 Please log into GitHub and then navigate to Copilot.');

    // Wait for user to complete login
    console.log('⏳ Waiting for login completion...');
    await page.waitForFunction(() => {
      // Check if user is logged in by looking for user menu
      const hasUserMenu = document.querySelector('[data-target="command-palette.personal-settings"]') !== null;
      const profileIcon = document.querySelector('[aria-label*="View profile"]') !== null;
      const hasAvatar = document.querySelector('.Header-link--profile img') !== null;
      return hasUserMenu || profileIcon || hasAvatar;
    }, { timeout: 0 }).catch(() => {
      console.log('⏰ Timeout waiting for login. Assuming login complete.');
    });

    console.log('\n✅ Login detected! Navigating to Copilot...');
    await page.goto('https://github.com/copilot/', { waitUntil: 'networkidle2' });

    console.log('💬 Stay on the Copilot page for a few seconds to ensure cookies are set...');
    await new Promise(r => setTimeout(r, 5000));

    // Get cookies after potential login
    const cookies = await page.cookies();
    const authCookies = cookies.filter(c =>
      ['user_session', 'logged_in', '__Host-user_session_same_site'].includes(c.name)
    );

    const hasAuth = authCookies.some(c => c.value && c.value.length > 10);

    if (hasAuth) {
      console.log('\n🎉 SUCCESS! Valid GitHub session detected!');
      console.log('Key authentication cookies found:');

      for (const cookie of authCookies) {
        const hasValue = cookie.value && cookie.value.length > 10;
        console.log(`  ${hasValue ? '✅' : '❌'} ${cookie.name}: ${hasValue ? 'valid' : 'invalid'}`);
      }

      console.log('\n🎯 You can now run: pnpm tsx scripts/copilot-poc.ts "How does GitHub Copilot work?"');
    } else {
      console.log('\n⚠️  Login appears incomplete. Please try running the script again.');
    }

    console.log('\n⏭️  Close the browser window when you are ready...');

    // Wait for browser close
    await browser.waitForTarget(() => false).catch(() => {});

  } finally {
    if (browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  manualLogin().catch(console.error);
}
