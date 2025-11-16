#!/usr/bin/env node
/**
 * Simple debugging to understand current GitHub cookie state
 */

console.log('🔍 Simple GitHub Cookie Debug\n');

async function simpleDebug() {
  try {
    const chromeCookies = await import('chrome-cookies-secure');
    const getCookiesPromised = chromeCookies.getCookiesPromised || chromeCookies.default?.getCookiesPromised;

    if (!getCookiesPromised) {
      console.log('❌ Cannot find getCookiesPromised function');
      return;
    }

    console.log('📤 Fetching cookies from GitHub...');
    const cookies = await getCookiesPromised('https://github.com', 'puppeteer', 'Default');

    console.log(`Found ${cookies.length} cookies:`);

    let validSession = false;
    const keyCookies = ['user_session', 'logged_in', '__Host-user_session_same_site'];

    for (const cookie of cookies) {
      const important = keyCookies.includes(cookie.name);
      const hasValue = cookie.value && cookie.value.length > 10;

      if (important && hasValue) {
        validSession = true;
      }

      const status = important && hasValue ? '🟢' : important ? '🔴' : '⚪';
      console.log(`  ${status} ${cookie.name.padEnd(30)}: ${hasValue ? cookie.value.substring(0, 10) + '...' : cookie.value || '(empty)'}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log(`🔐 Session Status: ${validSession ? '✅ VALID (ready for Copilot POC)' : '❌ INVALID (need to login)'}`);

    if (!validSession) {
      console.log('\n🛠️ To fix:');
      console.log('1. Run: tsx scripts/copilot-poc.ts');
      console.log('   with headless: false in the config');
      console.log('   or use: node tmp/manual-login.js');
      console.log('2. Log into GitHub when the browser opens');
      console.log('3. Close and retry the POC');
    }

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  simpleDebug();
}