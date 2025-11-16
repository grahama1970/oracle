#!/usr/bin/env node
/**
 * Deep debugging of GitHub authentication issues
 * Shows what's actually being extracted and why auth is failing
 */

import { syncCookies } from '../src/browser/cookies.ts';
import { COOKIE_URLS } from '../src/browser/constants.ts';

// Mock Network object from Chrome DevTools Protocol
const mockNetwork = {
  setCookie: async (cookie) => {
    const hasValue = cookie.value && cookie.value.length > 1;
    return { success: hasValue };
  }
};

async function debugGitHubAuth() {
  console.log('🔧 DEBUGGING GITHUB AUTHENTICATION ISSUE\n');

  console.log('📋 COOKIE_URLS configured:', COOKIE_URLS);
  console.log('📁 Chrome profile: Default');
  console.log('🔐 Testing authentication...\n');

  try {
    // Import the actual module used by cookies.ts
    const chromeCookies = await import('chrome-cookies-secure');
    const getCookiesPromised = chromeCookies.getCookiesPromised || chromeCookies.default?.getCookiesPromised;

    if (!getCookiesPromised) {
      throw new Error('Cannot find getCookiesPromised function');
    }

    // Test each URL separately
    for (const url of COOKIE_URLS) {
      console.log(`\n▶ Testing URL: ${url}`);

      try {
        const cookies = await getCookiesPromised(url, 'puppeteer', 'Default');
        console.log(`📊 Found ${cookies.length} cookie entries`);

        // Check for authentication cookies
        const isGitHub = url.includes('github');

        if (isGitHub) {
          console.log('🔍 Looking for GitHub auth cookies...');

          const authCookies = {
            'user_session': 'Primary session token',
            '__Host-user_session_same_site': 'CSRF-protected session',
            'logged_in': 'Login status flag',
            'dotcom_user': 'Username',
            '_gh_sess': 'Session ID',
            '_octo': 'GitHub device ID'
          };

          let hasValidSession = false;

          for (const cookie of cookies) {
            const description = authCookies[cookie.name];
            if (description) {
              const isValid = cookie.value && cookie.value.length > 5;
              const status = isValid ? '✅' : '❌';
              console.log(`  ${status} ${cookie.name.padEnd(30)}: ${isValid ? 'valid' : 'invalid/empty'}`);

              if (cookie.name === 'user_session' && isValid) {
                hasValidSession = true;
              }
            }
          }

          console.log(`\n🔐 Session status: ${hasValidSession ? '🟢 VALID' : '🔴 INVALID'}`);

          if (!hasValidSession) {
            console.log('📗 No valid user_session found in Chrome profile');
            console.log('\n🛠️ To fix this:');
            console.log('  1. Run: node tmp/manual-login.js');
            console.log('  2. Log into GitHub in the opened browser');
            console.log('  3. Navigate to https://github.com/copilot/');
            console.log('  4. Close the browser');
            console.log('  5. Run this test again');
          } else {
            console.log('\n🎉 Success! GitHub authentication appears to be working!');
          }
        } else {
          // ChatGPT/OpenAI check
          console.log('🔍 Looking for ChatGPT auth cookies...');
          const chatgptAuthCookies = cookies.filter(c =>
            ['__Secure-next-auth.session-token', 'oai-0', 'cf_clearance'].includes(c.name) && c.value
          );

          if (chatgptAuthCookies.length > 0) {
            console.log('✅ ChatGPT authentication detected');
          } else {
            console.log('⚠️ No ChatGPT session found');
          }
        }

      } catch (error) {
        console.log(`❌ Error fetching cookies for ${url}: ${error.message}`);
      }
    }

    // Now test the syncCookies function
    console.log('\n\n🔄 TESTING SYNCCOOKIES FUNCTION');
    console.log('This is what the actual browser mode uses...\n');

    let appliedTotal = 0;
    for (const url of COOKIE_URLS) {
      console.log(`Syncing cookies for: ${url}`);
      try {
        // Mock Network object with simple setCookie
        const applied = await syncCookies(mockNetwork, url, 'Default', () => {}, true);
        appliedTotal += applied;
        console.log(`  Applied ${applied} cookies`);
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
    }

    console.log(`\n📊 Total cookies applied: ${appliedTotal}`);

    if (appliedTotal === 0) {
      console.log('\n🔍 Analysis: No cookies were successfully synced');
      console.log('This explains why the POC shows marketing pages instead of authenticated content');
    }

  } catch (error) {
    console.log(`\n❌ Fatal error: ${error.message}`);
    console.log('Error stack:', error.stack);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  debugGitHubAuth();
}