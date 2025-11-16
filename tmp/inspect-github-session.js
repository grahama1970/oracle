#!/usr/bin/env node
/**
 * Deep dive into GitHub session cookies to identify authentication state
 */

import { exec } from 'child_process';

async function inspectGitHubSession() {
  console.log('🔍 Deep inspection of GitHub session cookies...\n');

  try {
    const chromeCookies = await import('chrome-cookies-secure');
    const getCookiesPromised = chromeCookies.getCookiesPromised || chromeCookies.default?.getCookiesPromised;

    // Check cookies for both git main and subdomains
    const hosts = ['github.com', '.github.com'];

    for (const host of hosts) {
      const url = `https://github.com`;
      try {
        const cookies = await getCookiesPromised(url, 'puppeteer', 'Default');

        console.log(`📍 Checking cookies from ${host}`);
        console.log(`Found ${cookies.length} cookies:`);

        // Key authentication cookies for GitHub
        const authCookies = {
          'user_session': 'Your primary GitHub session cookie',
          '__Host-user_session_same_site': 'Same-site session cookie',
          'logged_in': 'Indicates you\'re logged in',
          'dotcom_user': 'Your GitHub username',
          'tz': 'Timezone preference',
          '_octo': 'GitHub tracking cookie',
          '_device_id': 'Device identification',
          'saved_user_sessions': 'Multiple user session info (if any)',
          '_gh_sess': 'Another session-related cookie',
          'cf_clearance': 'CloudFlare clearance (if behind proxy)',
          '__Secure-next-auth.session-token': 'Copilot/Windstack auth token',
          'oai-0': 'OpenAI/ChatGPT-style cookies'
        };

        let validSession = false;

        for (const cookie of cookies) {
          const hasValue = cookie.value && cookie.value.length > 2;
          const desc = authCookies[cookie.name] || 'Unknown/Analytics/etc';
          const emoji = hasValue ? '✅' : '❌';

          if (['user_session', 'logged_in', '__Secure-next-auth.session-token'].includes(cookie.name) && hasValue) {
            validSession = true;
          }

          const valuePreview = cookie.value
            ? cookie.value.substring(0, Math.min(15, cookie.value.length)) + (cookie.value.length > 15 ? '...' : '')
            : '<empty>';

          console.log(`  ${emoji} ${cookie.name.padEnd(30)} = ${valuePreview.padEnd(20)} | ${desc}`);
        }

        if (validSession) {
          console.log(`\n✨ VALID SESSION DETECTED for ${host}\n`);
        } else {
          console.log(`\n⚠️  Session appears invalid for ${host}`);
          console.log('   Need to ensure you\'re properly logged in.\n');
        }

      } catch (error) {
        console.log(`❌ Failed extracting from ${host}:`, error.message);
      }
    }

    console.log('\n🎯 Copilot-specific cookies to check:');

    // Check for Copilot-specific domain
    try {
      const copilotCookies = await getCookiesPromised('https://github.com/copilot', 'puppeteer', 'Default');
      console.log(`Copilot page cookies: ${copilotCookies.length}`);

      for (const cookie of copilotCookies) {
        console.log(`  🍪 ${cookie.name}: ${cookie.value ? 'has value' : 'empty'}`);
      }
    } catch (e) {
      console.log(`❌ Could not get Copilot subdomain cookies: ${e.message}`);
    }

  } catch (error) {
    console.log(`❌ Error inspecting cookies: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  inspectGitHubSession()
    .then(r => r || process.exit(1))
    .catch(err => console.error(err));
}