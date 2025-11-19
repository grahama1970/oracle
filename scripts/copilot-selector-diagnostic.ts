#!/usr/bin/env tsx

import CDP from 'chrome-remote-interface';
import net from 'net';

const logger = (msg: string, data?: any) => {
  console.log(`[DIAG] ${msg}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

// The same snapshot expression from our fix
const snapshotExpr = `(() => {
  // NEW SNAPSHOT LOGIC: Always return the last non-empty markdown body

  // 1) Try scoped selection first (original logic)
  let scopedText = '';
  let scopedHtml = '';
  let scopeFound = false;
  let latestFound = false;

  // Original scoped snapshot attempt remains as first choice
  const scopeSelectors = [
    '[data-testid="chat-thread"]',
    'div[data-conversation]',
    '.chat-input-wrapper',
    'div[data-testid="chat-input-wrapper"]',
    'div[data-copilot-chat-input]',
    'div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_'
  ];

  let scope = null;
  for (const sel of scopeSelectors) {
    scope = document.querySelector(sel);
    if (scope) {
      scopeFound = true;
      break;
    }
  }

  let latestMsg = null;
  if (scope) {
    const assistantSelectors = [
      'div.message-container[class*="ChatMessage"][class*="ai" i]',
      'div[class*="assistant" i]',
      '[data-copilot-message="assistant"]',
      '[data-message-role="assistant"]'
    ];

    for (const sel of assistantSelectors) {
      const found = Array.from(scope.querySelectorAll(sel));
      if (found.length) {
        latestMsg = found.at(-1);
        latestFound = true;
        break;
      }
    }

    if (latestMsg) {
      const md = latestMsg.querySelector('div.markdown-body[data-copilot-markdown], div.markdown-body, .markdown');
      if (md && md.innerText?.trim()) {
        const cleaned = md.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi, '').trim();
        scopedText = cleaned.length > 0 ? cleaned : md.innerText;
        scopedHtml = md.innerHTML || '';
      }
    }
  }

  // 2) Fallback: Get the last non-empty markdown body on the page
  let globalMarkdown = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown');
  let globalMarkdownFound = false;
  let globalSource = 'none';
  let finalText = scopedText;
  let finalHtml = scopedHtml;

  if (scopedText.length === 0) {
    const visibleMarkdowArray = Array.from(globalMarkdown).filter(el => (el.innerText || '').trim().length > 0);

    if (visibleMarkdowArray.length > 0) {
      const lastMd = visibleMarkdowArray.at(-1);
      const cleaned = lastMd.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi, '').trim();
      finalText = cleaned.length > 0 ? cleaned : lastMd.innerText.trim();
      finalHtml = lastMd.innerHTML || '';
      globalMarkdownFound = true;
      globalSource = 'fallback';
      console.log(
        '[Snapshot Fallback Used]',
        'scopedLength:', scopedText.length,
        'fallbackLength:', finalText.length,
        'chosenSource:', globalSource
      );
    }
  }

  // 3) Determine typing status
  let isTyping = true;
  let hasAirplane = false;
  let hasStopIcon = false;
  let loadingAttr = null;

  const toolbarButton = document.querySelector('div.ChatInput-module__toolbarButtons--YDoIY > button') ||
                        document.querySelector('[data-component="IconButton"][data-loading]') ||
                        document.querySelector('[data-loading]');

  if (toolbarButton) {
    loadingAttr = toolbarButton.getAttribute('data-loading');
    const svg = toolbarButton.querySelector('svg');

    if (svg) {
      const svgClass = svg.getAttribute('class') || '';
      const svgAria = svg.getAttribute('aria-label') || '';

      hasStopIcon = svgClass.includes('octicon-square-fill') || /stop/i.test(svgAria);
      hasAirplane = svgClass.includes('octicon-paper-airplane') || /paper.?airplane/i.test(svgAria) ||
                    document.querySelector('svg.octicon-paper-airplane') !== null;
    }
  }

  // Typing rules simplified per your spec
  if (hasStopIcon || (loadingAttr && loadingAttr !== 'false')) {
    isTyping = true;
  } else if (hasAirplane) {
    isTyping = false;
  }

  // Return snapshot with flags
  return {
    text: finalText,
    html: finalHtml,
    isTyping: isTyping,
    chars: finalText.length || 0,
    hasMarkdown: finalText.length > 0,
    scopeFound: scopeFound,
    latestFound: latestFound,
    globalMarkdownFound: globalMarkdownFound,
    hasAirplane: hasAirplane,
    hasStopIcon: hasStopIcon,
    loadingAttr: loadingAttr,
    containsNav: /Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/i.test(finalText)
  };
})()`;

async function main() {
  console.log('=== Copilot Selector Diagnostic via Chrome DevTools Protocol ===\n');

  // Try to find a Chrome instance with remote debugging
  const debuggingPort = parseInt(process.env.CHROME_DEBUG_PORT || '9220', 10);
  const host = '127.0.0.1';

  console.log(`Looking for Chrome on ${host}:${debuggingPort}...`);

  // Check if Chrome is listening on debugging port
  const isPortOpen = await new Promise(resolve => {
    const socket = net.createConnection(debuggingPort, host);
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => resolve(false));
  });

  if (!isPortOpen) {
    console.log('No Chrome instance found with debugging port.');
    console.log('Alternative: Launch the browser via our automation:\n');
    console.log('  pnpm tsx scripts/diagnostic-selector-test.ts');
    console.log('\nThen navigate to GitHub Copilot manually and test from this script.');
    return;
  }

  // Connect to Chrome
  let client;
  try {
    client = await CDP({ port: debuggingPort, host });
  } catch (err) {
    console.error('Failed to connect to Chrome:', err);
    console.log('\nMake sure Chrome is running with --remote-debugging-port flag');
    console.log('Example: google-chrome --remote-debugging-port=9220');
    return;
  }

  const { Page, Runtime, DOM } = client;

  try {
    await Page.enable();
    await Runtime.enable();
    await DOM.enable();

    // Check current URL
    const { url, title } = await Page.getResourceTree();
    console.log(`Current page: ${title || 'No title'}`);
    console.log(`URL: ${url.substring(0, 60)}...`);

    // Navigate to GitHub Copilot if not already there
    if (!url.includes('github.com/copilot')) {
      console.log('\nNavigating to GitHub Copilot...');
      await Page.navigate({ url: 'https://github.com/copilot/' });
      await Page.loadEventFired();
      // Wait for dynamic content to load
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log('\nAlready on GitHub Copilot page');
      await new Promise(r => setTimeout(r, 1000));
    }

    // Run the diagnostic
    console.log('\n' + '='.repeat(60));
    console.log('RUNNING SELECTOR DIAGNOSTIC...');
    console.log('='.repeat(60) + '\n');

    const result = await Runtime.evaluate({
      expression: snapshotExpr,
      returnByValue: true
    });

    const data = result.result?.value;
    if (!data) {
      console.log('No data returned');
      return;
    }

    // Display results
    console.log('\n📊 SNAPSHOT RESULTS');
    console.log('─'.repeat(30));
    console.log(`Text found:        ${data.text.length > 0 ? `YES (${data.text.length} chars)` : 'NO'}`);
    console.log(`Source:            ${data.globalMarkdownFound ? 'FALLBACK (global)' : data.scopeFound ? 'SCOPED' : 'NONE'}`);
    console.log(`Scope found:       ${data.scopeFound ? '✓' : '✗'}`);
    console.log(`Assistant found:   ${data.latestFound ? '✓' : '✗'}`);
    console.log(`Global fallback:   ${data.globalMarkdownFound ? '✓' : '✗'}`);
    console.log(`Text preview:      "${data.text.substring(0, 80)}"${data.text.length > 80 ? '...' : ''}`);

    console.log('\n🔍 TOOLBAR STATUS');
    console.log('─'.repeat(30));
    console.log(`Toolbar found:     ${data.hasAirplane || data.hasStopIcon ? '✓' : '✗'}`);
    console.log(`Airplane icon:     ${data.hasAirplane ? '✈️  YES (uiDone=true)' : 'NO'}`);
    console.log(`Stop icon:         ${data.hasStopIcon ? '⏹  YES (typing)' : 'NO'}`);
    console.log(`Data-loading:      ${data.loadingAttr || 'null'}`);
    console.log(`IsTyping:          ${data.isTyping}`);

    console.log('\n🎯 IMMEDIATE EXIT CONDITION');
    console.log('─'.repeat(30));
    const uiDone = data.hasAirplane && (!data.loadingAttr || data.loadingAttr === 'false');
    const wouldExit = uiDone && data.text.length > 0;
    console.log(`UI Done:           ${uiDone}`);
    console.log(`Markdown > 0:       ${data.text.length > 0}`);
    console.log(`Would exit NOW:    ${wouldExit ? '✅ YES - immediate exit!' : '❌ NO - keep waiting'}`);

    // If no content found, show what selectors are available
    if (data.text.length === 0) {
      console.log('\n🔍 DIAGNOSTIC: Checking all markdown bodies on page...');
      const markdownCheck = await Runtime.evaluate({
        expression: `(() => {
          const allMd = document.querySelectorAll('div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown');
          return Array.from(allMd).map((md, i) => ({
            index: i,
            tagName: md.tagName,
            className: md.className.substring(0, 50),
            textLength: (md.innerText || '').trim().length,
            textPreview: (md.innerText || '').trim().substring(0, 50) + ((md.innerText || '').length > 50 ? '...' : ''),
            isVisible: md.offsetWidth > 0 && md.offsetHeight > 0
          }));
        })()`,
        returnByValue: true
      });

      const bodies = markdownCheck.result?.value || [];
      console.log(`Found ${bodies.length} markdown bodies on page:`);
      bodies.forEach((body: any) => {
        console.log(`  [${body.index}] ${body.tagName} "${body.className}" (${body.textLength} chars) ${body.isVisible ? '[VISIBLE]' : '[HIDDEN]'}`);
      });

      const visibleBodies = bodies.filter((b: any) => b.textLength > 0 && b.isVisible);
      if (visibleBodies.length > 0) {
        console.log(`\n✓ ${visibleBodies.length} visible, non-empty markdown bodies found!`);
        console.log(`  Fallback will use the last one: index ${visibleBodies.at(-1)?.index}`);
      } else {
        console.log('\n⚠ No visible, non-empty markdown bodies found.');
        console.log('Send a message to Copilot to generate a response, then run diagnostic again.');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Diagnostic complete. Chrome connection closed.');
    console.log('Recommendations:');
    console.log('- If scoped selector finds nothing but global bodies are visible ≈ our fallback&s working');
    console.log('- If global bodies don&exist & airline icons shown » script would wait forever (need bot to answer)');
    console.log('- If markdown exists & plane shown then w/FIX script should print [immediate-exit] instantly');

  } finally {
    if (client) await client.close();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

export default main;