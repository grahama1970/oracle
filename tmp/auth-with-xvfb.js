#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execSync);

async function authenticate() {
  console.log('🔐 Using X virtual framebuffer to authenticate Chrome...');

  // Quick cookie check before auth
  console.log('\n📋 PRE-SCAN - Current cookies:');
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execFile = promisify(exec);
    const result = await execFile('node tmp/simple-debug.js');
    console.log(result.stdout);
  } catch (e) {
    console.log('Could not pre-scan cookies');
  }

  // Try a lightweight auth approach using a simple Chrome launch
  console.log('\n─Authorizing Chrome with GitHub (copilot)──');
  console.log('This launches headful Chrome in the background. You have 2 minutes.');
  console.log('If nothing appears, Chrome might need manual control on this machine.');

  const chromeArgs = [
    // Basic Chrome launch args for clean but headful session
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--password-store=basic',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox', // Within container
    '--window-size=1280,720',
    '--start-maximized',         // Ensure login/wait parts show
    '--user-data-dir=' + process.env.HOME + '/.config/google-chrome/Default',
    'https://github.com/copilot/'
  ];

  console.log(`\n🚀 xvfb-run --server-args="-screen 0 1280x720x24" ... launching Chrome...`);

  // Launch Chrome via xvfb-run
  const proc = spawn('xvfb-run', [
    '--server-args',
    '-screen 0 1280x720x24',
    '/usr/bin/google-chrome',
    ...chromeArgs
  ], {
    detached: false,
    stdio: 'inherit'
  });

  console.log('⏳ xvfb Chrome spawned PID', proc.pid, '. Let it sit 30 seconds then terminate.\n');

  await new Promise(res => setTimeout(res, 30000));

  // Gracefully ask Chrome to close (SIGTERM then SIGKILL)
  try {
    console.log('🛑 Terminating xvfb Chrome...');
    process.kill(-proc.pid, 'SIGTERM');
  } catch (e) {
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch (ex) {
      console.log('Chrome already closed.');
      proc.unref();
    }
  }

  // Give it a beat
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n✅ Chrome session terminated.');
  console.log('🔍 POST-SCAN – trying cookies again:');

  // Show post-scan
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execFile = promisify(exec);
    try {
      await execFile('node tmp/simple-debug.js', (err, stdout) => {
        console.log(stdout);
      });
    } catch (readErr) {
      // nothing
    }
  } catch (ep) {
    console.log('Permission error reading cookies. Ls-al on /tmp/../ oracle directory may help.');
  }

  console.log('\n🧪 Done. If you still see “Session Status: ❌ INVALID”, try:');
  console.log('  - Run the POC with --headless false on a machine with display');
  console.log('  - Manually log into GitHub/Copilot via a GUI');
  console.log('  - Or prep Chrome on a machine with GUI, copy ~/.config/google-chrome to here');
}

// Only exec if main
if (import.meta.url === `file://${process.argv[1]}`) {
  authenticate().catch(console.error);
}