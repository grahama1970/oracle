#!/usr/bin/env tsx

/**
 * Real browser verification: uses the browser automation to go to Copilot,
 * type a test prompt, and log exactly what the new snapshotExpr returns.
 * We’ll ensure the fix shows:
 * - Fallback is used when scoped finds nothing ( chars=0 failure case )
 * - Immediate exit triggers on airplane + >0 markdown
 */

import { runBrowserMode } from '../src/browser/index.js';
import { delay } from '../src/browser/utils.js';

const myLogger = (msg: any) => console.log(new Date().toISOString().substr(11,8), msg);

// Create top-level vars for terminal listings
let spinner = ['|', '/', '-', '\\'];
let spinIdx = 0;

async function spin(msg: string, isTyping=false) {
  process.stdout.write('\033[2K\r' + spinner[spinIdx] + ' ' + (isTyping ? ' (typing)' : '') + ' ' + msg);
  spinIdx = (spinIdx + 1) % 4;
}

async function main() {
  console.clear();
  console.log('=== LIVE COPILOT TEST — Verify new snapshot logic (CDP) ===\n');

  // we'll dump to a file the live diagnostics every poll cycle
  const logPath = '/home/graham/workspace/experiments/oracle/tmp/copilot-fix-realtest.log';

  // emulator friendly
  const config = {
    chromeProfile: process.env.CHROME_PROFILE_DIR || `${process.env.HOME}/.oracle/chrome-profile`,
    chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    url: 'https://github.com/copilot/',
    timeoutMs: 900_000,                      // max 15 min thanks before
    headless: false,                          // 🔔 keep the window visible so you can interact
    keepBrowser: true,                        // CID topic borrowing snapshot-expr ASYNC scopes vs polling loop
    hideWindow: false,
    cookieSync: true,
    // Let's open with debug port so we can call Runtime.evaluate ourselves further
    // The dir existing (profile is live cookie session if you’ve ever logged in)
  };

  let diagnosticCounter = 0;

  // We’ll kick off a tiny CCDP session that ONLY runs the new snapshotExpr every second while
  // you’re inside the Copilot tab, logging raw data to tmp/copilot-fix-realtest.log.
  // We do NOT invoke full runBrowserMode(prompt=...) here because we only care about DOM selector instrumentation

  // Hook browser, then stay polling/top-level like detector rooms do.
  const { chrome_client, url, closeBrowser } = await runBrowserMode({
    config,
    log: myLogger,
    heartbeatIntervalMs: 30000,
  }, (dbg) => myLogger(dbg));

  myLogger(`Browser launched (debugging port exposed internally; keep window open!)`);
  myLogger('  Now:');
  myLogger('     1. SIGN-IN ← if you’re not already; CloudFlare & GitHub auth');
  myLogger('     2. Send any message to Copilot and wait for its response');
  myLogger('     3. Once YOU see 400–600 chars of markdown + 🛩️  in the UI, watch terminal');
  myLogger('     4. I should poll every second and show snapshot result → immediate-exit if >=1 char + uiDone');
  myLogger('     Ctrl-C when you see the hang myth busted.');
  console.log('');

  // Prep log file
  const fs = await import('fs/promises');
  await fs.writeFile(logPath, '# Copilot live diagnostic\n', 'utf8');

  // Now we live inside the **same** chrome client that runBrowserMode opened
  const { Page, Runtime, DOM } = chrome_client;
  async function diagSnapshot() {
    diagnosticCounter++;
    const RunRes = await Runtime.evaluate({
      expression: require('./copilot-selector-diagnostic.ts').default.snapshotExpr
        // BUT the real instrumentation uses the ACTUAL snapshotExpr from copilotNavigation that replaced selector logic
        .replace(/\/\/ NEW SNAPSHOT LOGIC.*/s, '');
      // instead let’s paste the exact code already in copilotNavigation:
      expression: require('fs').readFileSync('src/browser/actions/copilotNavigation.ts', 'utf8')
        .match(/const snapshotExpr = `[\s\S]*?";\n\n {2}\};\n\n {2}let firstLongAnswerAt/gm)?.[0] &&
        require('fs').readFileSync('src/browser/actions/copilotNavigation.ts', 'utf8') // fallback if regex doesn't work
          .match(/const snapshotExpr = `\(\(\) =\u003e \{[\s\S]*?(return \{.*text.*chars.*hasAirplane.*\}\;[\s\S]*?\}\;\n\n\);
\n/);
    });
    const s = RunRes.result?.value || {text:'',chars:0,hasAirplane:false,hasStopIcon:false,loadingAttr:null};
    const pretty = {
      now: new Date().toLocaleTimeString(),
      snapshot: {
        textLen: s.chars,
        isTyping: s.isTyping,
        hasAirplane: s.hasAirplane,
        hasStopIcon: s.hasStopIcon,
        loadingAttr: s.loadingAttr,
        containsNav: s.containsNav,
        // flags we exposed in the new snapshot
        scopeFound: s.scopeFound,
        latestFound: s.latestFound,
        globalMarkdownFound: s.globalMarkdownFound,
        uiDone: s.hasAirplane && (!s.loadingAttr || s.loadingAttr === 'false'),
      },
      // simulated exit decision
      verdict: s.hasAirplane && s.chars.text ? 'immediate-exit' : 'keep-polling'
    };
    await fs.appendFile(logPath, JSON.stringify(pretty) + '\n','utf8');
    return pretty;
  }

  // Poll continuously so you can watch what the live snapshot returns WITHOUT a test prompt
  // yet the moment Copilot responds with markdown + airplane, you’ll see immediate-exit
  myLogger('Live polling every second… (tail -f tmp/copilot-fix-realtest.log for raw)');
  (async function liveLoop() {
    let neverQuit = true;
    while (neverQuit) {
      await diagSnapshot();
      await delay(1000);
    }
    // fyi, ctrl-c closes the chrome_client in teardown ( headless: false, keepBrowser: true)
  })();

  // Kill handler — also gracefully closes streams so user sees open-loop end
  process.on('SIGINT', async () => {
    console.log('\n\nDetected Ctrl-C. Stopping live poll…\n');
    myLogger('Closed browser client reference. See tmp/copilot-fix-realtest.log for trace.');
    await closeBrowser();
    process.exit(0);
  });

  // keep alive quietly so uart isn’t closed
  await new Promise(() => {});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});