#!/usr/bin/env node
/**
 * Guide user through manual GitHub login in Chrome on Ubuntu
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('═══ GitHub Authentication Setup for Copilot POC ═══');
  console.log('');
  console.log('⚠️  IMPORTANT: You need to log into GitHub in Chrome to enable Copilot access.');
  console.log('');
  console.log('Step-by-step process:');
  console.log('1. Chrome will open automatically');
  console.log('2. Log into GitHub (click "Sign in" and enter your credentials)');
  console.log('3. After successful login, navigate to: https://github.com/copilot/');
  console.log('4. Wait for the Copilot page to load completely');
  console.log('5. Close Chrome window');
  console.log('');

  const proceed = await askQuestion('Press [Enter] to start, or type "skip" to cancel: ');

  if (proceed.toLowerCase() === 'skip') {
    console.log('❌ Skipping GitHub authentication setup.');
    rl.close();
    return;
  }

  console.log('🚀 Launching Chrome...');

  try {
    // Launch Chrome with Default profile
    execSync('/usr/bin/google-chrome --user-data-dir="$HOME/.config/google-chrome/Default" --no-first-run "https://github.com/login"',
      { stdio: 'inherit' });

    console.log('✅ Chrome session completed. Checking cookies...');

    // Check if cookies are now present
    console.log('');
    console.log('🔍 Running cookie check...');
    execSync('python3 -c "exec(open(\"tmp/check-cookies.py\", \"r\").read()); check_github_cookies()"', { stdio: 'inherit' });

  } catch (error) {
    console.error('❌ Error launching Chrome:', error.message);
  }

  rl.close();
}

if (require.main === module) {
  main().catch(console.error);
}