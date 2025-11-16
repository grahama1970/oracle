#!/usr/bin/env node
/**
 * Mock GitHub authentication for testing - sets minimal cookies needed
 * This simulates what would happen after real authentication
 */
import { spawn } from 'child_process';

function createMockCookies() {
  console.log('🧪 Creating minimal GitHub authentication cookies for testing...');

  // Create a simple Node script to set Chrome cookies via Debugging Protocol
  const setCookiesScript = `
const CDP = require('chrome-remote-interface');
const puppeteer = require('puppeteer');

async function setAuthCookies() {
  try {
    console.log('Creating Chrome browser with debugging port...');
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      userDataDir: process.env.HOME + '/.config/google-chrome/Default',
      headless: true,
      args: [
        '--remote-debugging-port=9222',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox'
      ]
    });

    // Wait for browser to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    const client = await CDP({ port: 9222 });
    const { Network } = client;

    await Network.enable();

    // Set minimal auth cookies for GitHub
    const authCookies = [
      {
        name: 'user_session',
        value: 'MOCK_AUTHTOKEN_' + Math.random().toString(36).substring(7),
        url: 'https://github.com',
        domain: 'github.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
      },
      {
        name: 'logged_in',
        value: '1',
        url: 'https://github.com',
        domain: 'github.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax'
      }
    ];

    for (const cookie of authCookies) {
      try {
        await Network.setCookie(cookie);
        console.log('✅ Set cookie:', cookie.name);
      } catch (err) {
        console.log('❌ Failed to set cookie:', cookie.name, err.message);
      }
    }

    await client.close();
    await browser.close();
    console.log('Mock authentication complete');
    process.exit(0);

  } catch (error) {
    console.error('Mock auth failed:', error.message);
    process.exit(1);
  }
}

setAuthCookies();
`;

  // Write the temporary script
  require('fs').writeFileSync('/tmp/set-auth-cookies.js', setCookiesScript);

  // Run it with xvfb
  console.log('Running mock auth via Chrome...');
  const proc = spawn('xvfb-run', ['-a', 'node', '/tmp/set-auth-cookies.js'], {
    stdio: 'inherit'
  });

  return new Promise((resolve) => {
    proc.on('exit', (code) => {
      require('fs').unlinkSync('/tmp/set-auth-cookies.js');
      resolve(code === 0);
    });
  });
}

async function authenticate() {
  const success = await createMockCookies();

  // Verify the cookies were set
  console.log('\n🔍 Verifying mock authentication...');
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const result = await execAsync('node tmp/simple-debug.js');
    console.log(result.stdout);

    if (result.stdout.includes('✅ VALID')) {
      console.log('\n🎉 Mock authentication successful! You can now test the Copilot POC.');
    } else {
      console.log('\n⚠️  Mock auth may need manual intervention. Use the regular login flow.');
    }
  } catch (e) {
    console.log('\n❌ Could not verify mock auth.');
  }
}

if (process.argv[2] === 'dry-run') {
  // Just show what would happen
  console.log('Dry run - would create these cookies:');
  console.log('- user_session: MOCK_AUTHTOKEN_XXXXXX');
  console.log('- logged_in: 1');
  console.log('');
  console.log('Run without dry-run to proceed or use manual authentication.');
} else {
  authenticate().catch(console.error);
}