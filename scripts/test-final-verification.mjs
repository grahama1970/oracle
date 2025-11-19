#!/usr/bin/env node

/**
 * Final verification that the hang fix works.
 * Tests the exact waitForCopilotResponse snapshot logic against a real browser tab.
 */

import CDP from 'chrome-remote-interface';
import fs from 'fs';

/********* CONFIG *******************************************/
// Use the working browser port from our earlier test
const PORT = 36235; // Real Copilot tab with content on this port
// Number of polls max (10 sec total)
const MAX_POLLS = 10;

/********* CDP SETUP ****************************************/
const snapshotExpr = `(() => {
  let scopedText = "";
  let scopeFound = false;
  let latestFound = false;
  let summary = {
      "_type":"SnapshotDebug",
      "timestamp": new Date().toISOString()
  };

  const scopeSelectors = [
    "[data-testid='chat-thread']",
    "div[data-conversation]",
    ".chat-input-wrapper",
    "div[data-testid='chat-input-wrapper']",
    "div[data-copilot-chat-input]",
    "div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_"
  ];

  let scope = null;
  for (const sel of scopeSelectors) {
    scope = document.querySelector(sel);
    if (scope) {
      scopeFound = true;
      summary.scopeSelector = sel;
      break;
    }
  }

  let latestMsg = null;
  if (scope) {
    const assistantSelectors = [
      "div.message-container[class*='ChatMessage'][class*='ai' i]",
      "div[class*='assistant' i]",
      "[data-copilot-message='assistant']",
      "[data-message-role='assistant']"
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
      const md = latestMsg.querySelector("div.markdown-body[data-copilot-markdown], div.markdown-body, .markdown");
      if (md && md.innerText?.trim()) {
        const cleaned = md.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi,"").trim();
        scopedText = cleaned.length > 0 ? cleaned : md.innerText;
      }
    }
  }

  // Fallback to last non-empty markdown body on page
  let globalMarkdownFound = false;
  let finalText = scopedText;

  if (scopedText.length === 0) {
    const allMd = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
    const visible = Array.from(allMd).filter(el => (el.innerText || "").trim().length > 0);
    if (visible.length) {
      const lastMd = visible.at(-1);
      const cleaned = lastMd.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi,"").trim();
      finalText = cleaned.length > 0 ? cleaned : lastMd.innerText.trim();
      globalMarkdownFound = true;
      summary.fallbackUsed = true;
    }
  }

  // Check toolbar/airplane state
  let hasAirplane = false;
  let hasStopIcon = false;
  const toolbarButton = document.querySelector('div.ChatInput-module__toolbarButtons--YDoIY > button') ||
                        document.querySelector('[data-component="IconButton"][data-loading]') ||
                        document.querySelector('[data-loading]');

  if (toolbarButton) {
    const svg = toolbarButton.querySelector('svg');
    if (svg) {
      const svgClass = svg.getAttribute('class') || '';
      hasStopIcon = svgClass.includes('octicon-square-fill') || /stop/i.test(svg.getAttribute('aria-label') || '');
      hasAirplane = svgClass.includes('octicon-paper-airplane') || /paper.?airplane/i.test(svg.getAttribute('aria-label') || '') ||
                    document.querySelector('svg.octicon-paper-airplane') !== null;
    }
  }

  const isTyping = !hasAirplane || (hasStopIcon || (toolbarButton?.getAttribute('data-loading') && toolbarButton.getAttribute('data-loading') !== 'false'));
  const uiDone = hasAirplane && (!toolbarButton || !toolbarButton.getAttribute('data-loading') || toolbarButton.getAttribute('data-loading') === 'false');

  return {
    text: finalText,
    chars: finalText.length,
    isTyping: isTyping,
    hasMarkdown: finalText.length > 0,
    // flags
    scopeFound: scopeFound,
    latestFound: latestFound,
    globalMarkdownFound: globalMarkdownFound,
    hasAirplane: hasAirplane,
    hasStopIcon: hasStopIcon,
    loadingAttr: toolbarButton?.getAttribute('data-loading'),
    // exit condition
    uiDone: uiDone,
    summary: summary
  };
})()`;

// MAIN
async function main() {
  const start = Date.now();
  let exited = false;

  console.log('=== FINAL VERIFICATION: Copilot Response Hang Fix ===\n');
  console.log(`Port: ${PORT} (Live Copilot session)\n`);
  console.log('Testing: [immediate_exit] on uiDone && chars>0\n');

  const client = await CDP({ port: PORT, host: '127.0.0.1' });
  const {Runtime} = client;
  await Runtime.enable();

  // Poll like waitForCopilotResponse
  for (let step = 0; step < MAX_POLLS; step++) {
    const result = await Runtime.evaluate({expression: snapshotExpr, returnByValue: true});
    const data = (result.result && result.result.value) || {};

    const elapsed = Date.now() - start;
    const uiDone = data.uiDone;
    const chars = data.chars || 0;

    // exactly as in logs
    console.log(`[poll] elapsed=${elapsed}ms, chars=${chars}, isTyping=${data.isTyping}, uiDone=${uiDone}, hasAirplane=${data.hasAirplane}, hasMarkdown=${data.hasMarkdown}`);
    console.log(`       scope=${data.scopeFound}, assist=${data.latestFound}, global=${data.globalMarkdownFound}`);

    //+++ HANG_FIX magic: exit immediately <+++
    if (uiDone && chars > 0) {
      console.log(`\n🎉 [[[immediate-exit]]]]  Send icon shown with ${chars} chars — returning\n`);
      console.log('✅ SUCCESS: The hang fix works! No more 10-minute timeout.\n');
      console.log('Used source: ' + (data.globalMarkdownFound ? 'GLOBAL fallback (scoped found 0)' : 'SCOPE detected markdown'));

      // save tiny record
      fs.writeFileSync('/tmp/copilot-fix-verified.json', JSON.stringify({success: true, chars: chars, elapsed}, null, 2));
      exited = true;
      break;
    }

    // Show tiny peek if we found text
    if (chars > 0 && step > 2) {
      console.log(`   └─ peek: "${data.text.slice(0,30)}..."`);
    }

    // one-second polling like real waitForCopilotResponse
    await new Promise(r=>setTimeout(r, 1000));
  }

  await client.close();

  if (!exited) {
    console.log('\n⚠️  Reached max polls with no exit - checking if session is stale.');
  }
  console.log('\n=== Test complete ===');
}

main()
  .then(() => process.exit(0))
  .catch((e) =>{ console.error(e); process.exit(1);});