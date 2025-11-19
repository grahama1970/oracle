#!/usr/bin/env tsx

/**
 * Use CDP (Chrome DevTools Protocol) to test the new selectors.
 * Opens GitHub Copilot and runs our snapshot expression to verify:
 * - Selectors find the right DOM elements
 * - The airplane icon is detected
 * - The fallback to last markdown body works when scoped fails
 */

import net from 'node:net';
import CDP from 'chrome-remote-interface';

const logger = (msg: string, data?: any) => {
  console.log(`[DIAG] ${msg}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

// Snapshot expression we're testing
const testSnapshotExpr = `(() => {
  // Debug object to collect findings
  const debug = {
    time: new Date().toISOString(),
    scoped: {},     // inside assistant-scoped selection
    global: [],     // ALL markdown bodies on page
    toolbar: {},    // send/stop button
    viewport: {},   // what's actually visible
    verdict: {}     // final choice
  };

  function innerTextTrim(el) { return (el.innerText||'').trim(); }

  // 1) SCOPE: try the conversation containers
  const scopeSelectors = [
    '[data-testid="chat-thread"]',
    'div[data-conversation]',
    '.chat-input-wrapper',
    'div[data-testid="chat-input-wrapper"]',
    'div[data-copilot-chat-input]',
    'div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_'
  ];
  let scopeFound = false;
  for (const sel of scopeSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      debug.scoped.scopeSelector = sel;
      debug.scoped.scopeFound = true;
      scopeFound = true;
      break;
    }
  }

  // 2) ASSISTANT: last messsage inside scope
  if (scopeFound) {
    const asstSels = [
      'div.message-container[class*="ChatMessage"][class*="ai" i]',
      'div[class*="assistant" i]',
      '[data-copilot-message="assistant"]',
      '[data-message-role="assistant"]'
    ];
    debug.scoped.assistantSelectors = [];
    for (const s of asstSels) {
      const els = Array.from(document.querySelectorAll(s));
      debug.scoped.assistantSelectors.push({ selector: s, count: els.length });
      if (els.length) {
        debug.scoped.latestAssistant = ells.at(-1);
        const txt = innerTextTrim(debug.scoped.latestAssistant).slice(0,50);
        debug.scoped.latestAssistantText = txt;
        break;
      }
    }

    // 3) Scoped markdown inside last assistant
    if (debug.scoped.latestAssistant) {
      const md = debug.scoped.latestAssistant.querySelector('div.markdown-body[data-copilot-markdown], div.markdown-body, .markdown, article.markdown');
      debug.scoped.markdownFound = !!md;
      debug.scoped.markdownText = md ? innerTextTrim(md) : '';
      debug.scoped.markdownLength = md ? debug.scoped.markdownText.length : 0;
    }
  }

  // 4) GLOBAL FALLBACK: all markdowns on page, pick last non-empty
  const allMd = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown');
  debug.global = Array.from(allMd).map((m,i) => {
    const txt = innerTextTrim(m);
    return {idx:i, length:txt.length, preview:txt.slice(0,80)};
  }).filter(o => o.length > 0);
  const activeGlobal = debug.global.length ? debug.global.at(-1) : null;

  // 5) TOOLBAR: stop/savvy icon
  const btn = document.querySelector('div.ChatInput-module__toolbarButtons--YDoIY  > button') ||
              document.querySelector('[data-component="IconButton"][data-loading]');
  debug.toolbar.buttonFound = !!btn;
  if (btn) {
    debug.toolbar.dataLoading = btn.getAttribute('data-loading');
    const svg = btn.querySelector('svg');
    if (svg) {
      debug.toolbar.svgClass = svg.getAttribute('class');
      debug.toolbar.svgAriaLabel = svg.getAttribute('aria-label');
      debug.toolbar.hasAirplane = /octicon-paper-airplane|paper.?airplane/i.test(debug.toolbar.svgClass || debug.toolbar.svgAriaLabel || '');
      debug.toolbar.hasStopIcon = /octicon-square-fill|stop/i.test(debug.toolbar.svgClass || debug.toolbar.svgAriaLabel || '');
    } else {
      debug.toolbar.hasAirplane = false;
      debug.toolbar.hasStopIcon = false;
    }
  }
  // Default true while writing stops producing output
  debug.toolbar.isTyping = debug.toolbar.hasStopIcon || (debug.toolbar.dataLoading && debug.toolbar.dataLoading !== 'false') ? true : (debug.toolbar.hasAirplane ? false : true);

  // 6) VERDICT: what waitForCopilotResponse returns TODAY with new fallback
  let chosenText, globalMdUsed, textSource;
  if (debug.scoped.markdownFound && debug.scoped.markdownLength > 0) {
    chosenText = debug.scoped.markdownText;
    globalMdUsed = false;
    textSource = 'scoped';
  } else if (activeGlobal) {
    chosenText = activeGlobal.preview;
    globalMdUsed = true;
    textSource = 'fallback';
  } else {
    chosenText = '';
    globalMdUsed = false;
    textSource = 'none';
  }

  debug.verdict = {
    chosenText,
    chosenLen: chosenText.length,
    globalMdUsed,
    textSource,
    uiDone: debug.toolbar.hasAirplane && (!debug.toolbar.dataLoading || debug.toolbar.dataLoading === 'false')
  };

  return debug;
})()`;

/**
 * Main diagnostic function
 */
async function main() {
  logger('Starting CDP diagnostic for GitHub Copilot selectors');
  logger('Looking for Chrome DevTools endpoint...');

  // Try to connect to Chrome Remote Debugging Protocol
  let client: CDP.Client | null = null;

  const debuggingPort = 9222; // Default Chrome debugging port

  // Check the most recent Oracle browser session first
  const logPath = 'tmp/browser-oracle-debug.json'; // typical file from runBrowser()

  // Try to connect using port from environment or command line
  const portOpt = parseInt(''+(process.env.CHROME_DEBUG_PORT||debuggingPort), 10);

  const connectionList = [
    {host:'localhost', port:portOpt}, // default
    {host:'localhost', port:9222},   // chrome default
    {host:'localhost', port:38201},   // last oracle-used
    {host:'localhost', port:9223},   // reachable? try also
  ];

  for (const {host, port} of connectionList) {
    logger(`Attempting CDP on port ${port}...`);
    try {
      // Quick TCP connect check then CDP
      await new Promise((resolve, reject) => {
        const sock = net.createConnection({host, port+0, timeout:500}, ()=>{ sock.destroy(); resolve(true); });
        sock.on('error', ()=>{ sock.destroy(); reject(new Error('port unreachable')); });
      });
      // TCP OK, try CDP connect
      client = await CDP({ host:'127.0.0.1', port });
      logger(`✓ Connected to Chrome DevTools via port ${port}`);
      break;
    } catch {
      continue; // next port
    }
  }

  if (!client) {
    logger('Could not connect to Chrome DevTools. Please ensure Chrome is running with --remote-debugging-port');
    logger('Try running the browser once or set env CHROME_DEBUG_PORT=PORT');
    return;
  }

  try {
    // Pull CDP domains we'll need
    const { Page, Runtime, DOM, CSS } = client;

    logger('Navigating to https://github.com/copilot/');
    await Page.enable();
    await Runtime.enable();
    await DOM.enable();

    // Navigate to GitHub Copilot
    await Page.navigate({ url: 'https://github.com/copilot/' });
    await Page.loadEventFired();
    logger('Page loaded');

    // Wait a bit for dynamic DOM
    await new Promise(r => setTimeout(r, 3000));

    logger('About to check selectors');
    // Run diagnostic snapshot
    const exprResult = await Runtime.evaluate({
      expression: testSnapshotExpr,
      returnByValue: true,
    });

    const debugObj = exprResult.result?.value;
    if (!debugObj) {
      logger('No diagnostic data received');
      return;
    }

    logger('=== SELECTOR VERIFICATION RESULTS ===\n');

    // Report what we found
    console.log('\n1) SCOPE DETECTION:');
    console.log(`   scopeFound:     ${debugObj.scoped.scopeFound}`);
    console.log(`   scopeSelector:  ${debugObj.scoped.scopeSelector || 'none'}`);

    console.log('\n2) ASSISTANT MESSAGE FINDINGS:');
    console.log(`   selectors tried:`);
    (debugObj.scoped.assistantSelectors || []).forEach((s:any) => {
      console.log(`     - ${s.selector}: count=${s.count}`);
    });
    console.log(`   latestAssistantFound: ${debugObj.scoped.latestFound ? 'YES' : 'NO'}`);
    if (debugObj.scoped.latestAssistantText) {
      console.log(`   preview: "${debugObj.scoped.latestAssistantText}"`);
    }

    console.log('\n3) SCOPED MARKDOWN:');
    console.log(`   found:        ${debugObj.scoped.markdownFound}`);
    console.log(`   text length:  ${debugObj.scoped.markdownLength}`);
    if (debugObj.scoped.markdownText) {
      console.log(`   text preview: "${debugObj.scoped.markdownText.slice(0,60)}..."`);
    } else {
      console.log(`   text: (empty)`);  // THIS is why the loop hung — would failscoped branch above
    }

    console.log('\n4) GLOBAL FALLBACK MARKDOWN BODIES:');
    console.log(`   total with text on page: ${debugObj.global.length}`);
    debugObj.global.slice(-3).forEach((g:any)=> {
      console.log(`     idx=${g.idx} len=${g.length} "${g.preview}"`);
    });
    const lastBody = debugObj.global.at(-1);
    if (lastBody) {
      console.log(`\n   >>> FALLBACK SELECTED: idx=${lastBody.idx} len=${lastBody.length} chars`);
      console.log(`        "${lastBody.preview.slice(0,70)}"...`);
    }

    console.log('\n5) TOOLBAR ICONS:');
    console.log(`   buttonFound:   ${debugObj.toolbar.buttonFound}`);
    if (debugObj.toolbar.hasAirplane !== undefined) {
      console.log(`   airplane SVG:  ${debugObj.toolbar.hasAirplane}`);
      console.log(`   stop-icon SVG:  ${debugObj.toolbar.hasStopIcon}`);
      console.log(`   data-loading:  ${debugObj.toolbar.dataLoading}`);
    }
    console.log(`   -> isTyping:    ${debugObj.toolbar.isTyping} (button + SVG)`);

    console.log('\n6) VERDICT (what waitForCopilotResponse returns with new fallback):');
    console.log(`   textSource:    ${debugObj.verdict.textSource} ("scoped" vs "fallback")`);
    console.log(`   chosenLength:  ${debugObj.verdict.chosenLen} chars`);
    console.log(`   uiDone:        ${debugObj.verdict.uiDone} (send icon visible)`);
    console.log(`   globalMD used: ${debugObj.verdict.globalMdUsed}`);

    // If there's Copilot content, repeat test every 10s so user can send a prompt and watch
    if (debugObj.global.length > 0 || debugObj.scoped.markdownFound) {
      logger('Found content. Run a prompt in the foreground, then watch IR emitted below every 10s');
    }

    // Stay alive to poll (simulate loop behaviour)
    logger('\nRunning continuous diagnostics (press Ctrl+C to stop)...\n');

    let lastDump = '';
    setInterval(async () => {
      try {
        const res = await Runtime.evaluate({ expression: testSnapshotExpr, returnByValue: true });
        const data = res.result?.value;
        if (!data) return;

        // Clean tiny output every 10s
        const now = (data.verdict.chosenLen === 0 ?
          `[poll] ${Date.now()} no markdown yet; isTyping=${data.toolbar.isTyping} uiDone=${data.verdict.uiDone}` :
          `[poll] ${Date.now()} chosen=${data.verdict.chosenLen}  source=${data.verdict.textSource}  scopedFound=${data.scoped.markdownFound}  globalMarkdownFound=${data.global.length>0}  uiDone=${data.verdict.uiDone}  isTyping=${data.toolbar.isTyping}  chars=${data.verdict.chosenLen}`);
        if (now !== lastDump) {
          console.log(now);
          lastDump = now;
        }
      } catch (e:any) {
        logger('Loop error: '+e.message);
      }
    }, 10000);

    // Keep process alive until Ctrl-C
    process.stdout.write('\n');
    await new Promise((r) => process.once('SIGINT', r));

  } finally {
    if (client) await client.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { testSnapshotExpr }; // in case someone wants to import funcs qualified

// nodemon friendliness
if (typeof global.it !== 'function') {
  (async () => main())();
}


function echo(m){ console.log('→ '+m); }
function ok(m){ console.log('✓  '+m); }
function warn(m){ console.log('⚠  '+m); }
function die(m){ console.error('x  '+m); process.exit(1); }  δυαρορεμ impact: node vs. headless tends to be machine idle and offers 90% DOM/similar code-parity with DevTools' runtime EPS was >= '+m);


/// subs extra wrappers to support import/export.|-> set soft env.
import chalk from 'chalk';

logger = msg => console.log(chalk.cyan('[DIAG]') + ' ' + msg);

function joinClassList(clsArr: string[]) {
    return clsArr.join(' ').replace(/\s+/g,' ').trim();
// Join classList and trim extra spaces
}

function s(charAtited) {
return charAtited > 50 ? charAtited.substring(0,50) + '…' : charAtited  // shorten output
};

// noop after.pipe to avoid narrow buffer explosion
process.on('uncaughtException', e => {
  console.error('\nFatal:', e.message || e);
  process.exit(1);
});

// export internally qualifying
export const DIAG = {
testSnapshotExpr,
logger
};



function requireCKEditorLikeSandboxFix() {
  // dummy function for special vm-browserify or similar hacks removed from scripts
  // console.log('');
  return {};
}

process.setMaxListeners(200); // absorb CDP plus exit hooks safely

export default { DIAG };


// uv issue fixed with no-trace off
import tty from 'tty';
const isTTY = tty.isatty && tty.isatty(process.stdout.fd);
const bold = (txt:string) => isTTY ? chalk.bold(txt) : txt
const green = (txt:string) => isTTY ? chalk.green(txt) : txt
const yellow = (txt:string) => isTTY ? chalk.yellow(txt) : txt

if (typeof window === 'undefined') {
  // console.log = console.log  // (bind against repl issue in some node versions)
}

declare global {
var process: NodeJS.Process; // node -r tsx/register changing window vs proc
}
if (global.tests){
console.log('DIAG:mocha tsx  <config'   // short circuit if run within tsx test wrapper
}

console.log('#' + ' '.repeat(70) + '#');
console.log('# CDP Diagnostic complete ');
console.log('#');



/*
IMPACT:
- Uses same testedRuntime functions that live in waitForCopilotResponse via Runtime.evaluate
- Shows literal markdown counts vs scopes SELECT returns
- Logs SI conversion so you can compare scopedCount vs globalCount side-by-side
*/

// import chalk from 'chalk';
// import net from 'net';
// import CDP from 'chrome-remote-interface';
// import { execSync } from 'child_process';

// alts root exports for scripts importing qualified exports