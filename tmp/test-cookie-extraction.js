#!/usr/bin/env node
/**
 * Test GitHub cookie extraction after configuring the proper URLs
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testCookieExtraction() {
  console.log('🔍 Testing GitHub cookie extraction with updated COOKIE_URLS...');

  try {
    // Test the chrome-cookies-secure module directly
    console.log('📥 Loading chrome-cookies-secure...');

    const chromeCookies = await import('chrome-cookies-secure');
    const getCookiesPromised = chromeCookies.getCookiesPromised || chromeCookies.default?.getCookiesPromised;

    if (!getCookiesPromised) {
      throw new Error('chrome-cookies-secure module structure unexpected');
    }

    console.log('📤 Fetching cookies for GitHub domains...');

    // Test GitHub with Default profile
    try {
      const cookies = await getCookiesPromised('https://github.com', 'puppeteer', 'Default');
      console.log(`\n🔸 Found ${cookies.length} cookies for GitHub:`);

      const important = ['user_session', '__Host-user_session_same_site', 'logged_in', 'dotcom_user'];
      let hasSessionCookie = false;

      for (const cookie of cookies) {
        const isImportant = important.includes(cookie.name);
        const valuePreview = cookie.value ?
          cookie.value.substring(0, 10) + (cookie.value.length > 10 ? '...' : '') :
          '(empty)';

        if (isImportant && cookie.value) {
          hasSessionCookie = true;
        }

        const status = isImportant && cookie.value ? '✅' : '';
        console.log(`   ${status} ${cookie.name}: ${isImportant ? valuePreview : (cookie.value ? '(has value)' : '(empty)')}`);
      }

      if (hasSessionCookie) {
        console.log('\n✅ GitHub session detected! The cookies appear to be valid.');
        return true;
      }

    } catch (error) {
      console.log(`\n❌ Failed to get cookies: ${error.message}`);
    }

    console.log('\n⚠️  No valid GitHub session cookies found.');
    console.log('Need to authenticate with GitHub first.');
    return false;

  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('\n❌ chrome-cookies-secure module not found.');
      console.log('Run: pnpm add chrome-cookies-secure');
    } else {
      console.log('\n❌ Error:', error.message);
    }
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testCookieExtraction().catch(console.error);
}