#!/usr/bin/env node

// Direct CDP test
import CDP from 'chrome-remote-interface';

const PORT = 36235;

const testExpr = `(() =\u003e {
  // Our new snapshot logic - test this exact code
  let scopedText = "";
  let scopeFound = false;
  let latestFound = false;

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

  // Fallback: last non-empty markdown body on page
  let globalMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
  let globalMarkdownFound = false;
  let finalText = scopedText;

  if (scopedText.length === 0) {
    const visibleMarkdownArray = Array.from(globalMarkdown).filter(el => (el.innerText || "").trim().length > 0);
    if (visibleMarkdownArray.length > 0) {
      const lastMd = visibleMarkdownArray.at(-1);
      const cleaned = lastMd.innerText.replace(/Toggle sidebar|New chat|Manage chat|Agents|Quick links|Spaces|SparkPreview|Open workbench|WorkBench|Share/gi,"").trim();
      finalText = cleaned.length > 0 ? cleaned : lastMd.innerText.trim();
      globalMarkdownFound = true;
    }
  }

  // Check toolbar
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

  const uiDone = hasAirplane \u0026\u0026 (!toolbarButton?.getAttribute('data-loading') || toolbarButton.getAttribute('data-loading') === 'false');

  return {
    text: finalText,
    chars: finalText.length,
    // Flags
    scopeFound: scopeFound,
    latestFound: latestFound,
    globalMarkdownFound: globalMarkdownFound,
    // Toolbar
    hasAirplane: hasAirplane,
    hasStopIcon: hasStopIcon,
    uiDone: uiDone,
    // Exit check
    wouldExitNow: uiDone \u0026\u0026 finalText.length \u003e 0
  };
})()`;

async function main() {
  console.log(`=== Testing New Snapshot Logic on Port ${PORT} ===\n`);

  let client;
  try {
    // Connect to Chrome
    client = await CDP({ port: PORT, host: '127.0.0.1' });

    const { Runtime } = client;

    await Runtime.enable();

    // Run the test
    const result = await Runtime.evaluate({
      expression: testExpr,
      returnByValue: true
    });

    const data = result.result?.value;

    console.log('\n📊 RESULTS:');
    console.log('─'.repeat(50));
    console.log(`Final text length: ${data.chars} chars`);
    console.log(`Source: ${data.globalMarkdownFound ? 'FALLBACK (global)' : 'SCOPED'}`);
    console.log(`\nSelector findings:`);
    console.log(`  Scope found:      ${data.scopeFound ? '✓' : '✗'}`);
    console.log(`  Assistant found:  ${data.latestFound ? '✓' : '✗'}`);
    console.log(`  Global markdown:  ${data.globalMarkdownFound ? '✓ (fallback used)' : '✗'}`);

    console.log('\n🎯 Toolbar Status:');
    console.log('─'.repeat(50));
    console.log(`Airplane icon:     ${data.hasAirplane ? '✈️  SHOWN' : 'NOT shown'}`);
    console.log(`UI Done:           ${data.uiDone ? 'TRUE (send icon visible)' : 'FALSE'}`);

    console.log('\n🔥 EXIT TEST:');
    console.log('─'.repeat(50));
    console.log(`Would exit now?    ${data.wouldExitNow ? '✅ YES! The hang fix works!' : '❌ NO - still polling'}`);

    if (data.globalMarkdownFound) {
      console.log('\n✨ FALLBACK WORKING: Used global markdown because scoped found nothing');
    }

    console.log('\n' + '='.repeat(60));

    // Cleanup
    await client.close();

  } catch (err) {
    console.error('Error:', err.message);
    if (client) await client.close();
  }
}

// Run
main().catch(console.error);