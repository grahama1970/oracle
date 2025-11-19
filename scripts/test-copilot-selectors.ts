#!/usr/bin/env tsx

import { launchBrowser } from '../src/browser/index.js';
import { delay } from '../src/browser/utils.js';
import type { BrowserLogger } from '../src/browser/types.js';

async function main() {
  const logger: BrowserLogger = (msg, data) => {
    console.log('[LOG]', msg);
    if (data) console.log('[DATA]', JSON.stringify(data, null, 2));
  };

  console.log('=== Testing Copilot Selectors ===');
  console.log('This script will: ');
  console.log('1. Navigate to GitHub Copilot');
  console.log('2. Wait a moment for the page to stabilize');
  console.log('3. Run the snapshot expression with verbose logging');
  console.log('4. Report back exactly what selectors are detecting (or not)');
  console.log('');
  console.log('Instructions: ');
  console.log('- Make sure you are logged into GitHub');
  console.log('- Send a test prompt when ready');
  console.log('- Wait for Copilot to respond with visible markdown');
  console.log('');

  console.log('Launching browser...');
  const { chrome_client } = await launchBrowser({
    chromeProfile: process.env.CHROME_PROFILE_DIR || `${process.env.HOME}/.oracle/chrome-profile`,
    chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    url: 'https://github.com/copilot/',
    timeoutMs: 900000,
    headless: false,
    keepBrowser: true,
    hideWindow: false,
    debug: true,
    cookieSync: true,
  }, logger);

  const { Page, Runtime } = chrome_client;

  console.log('\nWaiting for page to load and stabilize...');
  await delay(3000);

  console.log('\n=== Running diagnostic selector test ===');

  const testExpr = `(() => {
    const results: any = {
      timestamp: new Date().toISOString(),
      diagnostic: true
    };

    // 1) Test scopes
    const scopeSelectors = [
      '[data-testid="chat-thread"]',
      'div[data-conversation]',
      '.chat-input-wrapper',
      'div[data-testid="chat-input-wrapper"]',
      'div[data-copilot-chat-input]',
      'div.ConversationView-module__container--XaY36 div.ImmersiveChat-module__messageContent--JE3f_',
      'body'
    ];

    results.scopes = {};
    for (const sel of scopeSelectors) {
      const el = document.querySelector(sel);
      results.scopes[sel] = {
        found: !!el,
        tagName: el?.tagName,
        className: el?.className?.substring(0, 100),
        id: el?.id
      };
    }

    // 2) Test assistant selectors
    const assistantSelectors = [
      '[data-copilot-message="assistant"]',
      '[data-testid="assistant-message"]',
      '[data-message-role="assistant"]',
      'div[class*="ChatMessage"][class*="ai" i]',
      'div[class*="assistant"]'
    ];

    results.assistants = {};
    for (const sel of assistantSelectors) {
      const els = document.querySelectorAll(sel);
      results.assistants[sel] = {
        count: els.length,
        lastOneText: els.length > 0 ? els[els.length-1].innerText?.substring(0, 50) + '...' : ''
      };
    }

    // 3) Test markdown selectors
    const markdownSelectors = [
      '[data-copilot-markdown="true"]',
      'div.markdown-body[data-copilot-markdown]',
      'div.markdown-body',
      '.markdown',
      '[data-testid="copilot-markdown"]'
    ];

    results.markdowns = {};
    for (const sel of markdownSelectors) {
      const els = document.querySelectorAll(sel);
      results.markdowns[sel] = {
        count: els.length,
        lastOneText: els.length > 0 ? els[els.length-1].innerText?.substring(0, 100) + '...' : '',
        lastOneTextLength: els.length > 0 ? els[els.length-1].innerText?.length : 0
      };
    }

    // 4) Test toolbar selectors
    const toolbarSelectors = [
      'div.ChatInput-module__toolbarButtons--YDoIY > button',
      'button[data-component="IconButton"][data-loading]',
      '[data-loading]',
      'button[aria-label*="send"]'
    ];

    results.toolbar = {};
    for (const sel of toolbarSelectors) {
      const el = document.querySelector(sel);
      results.toolbar[sel] = {
        found: !!el,
        dataLoading: el?.getAttribute('data-loading'),
        svgClass: el?.querySelector('svg')?.getAttribute('class'),
        svgAriaLabel: el?.querySelector('svg')?.getAttribute('aria-label')
      };
    }

    // 5) Comprehensive search - look for any large markdown-containing elements
    const allMarkdownEls = Array.from(document.querySelectorAll('div.markdown-body, [data-copilot-markdown], .markdown, article.markdown'));
    const visibleMarkdown = allMarkdownEls.filter(el => {
      const rect = el.getBoundingClientRect();
      const isInViewport = rect.top >= 0 && rect.top <= window.innerHeight;
      const hasText = (el.innerText || '').trim().length > 50;
      return isInViewport && hasText && !el.closest('[aria-hidden="true"]');
    });

    results.visibleMarkdown = {
      count: visibleMarkdown.length,
      elements: visibleMarkdown.map(el => ({
        tagName: el.tagName,
        classList: Array.from(el.classList),
        textLength: el.innerText.trim().length,
        textPreview: el.innerText.trim().substring(0, 50) + '...',
        inViewport: true
      }))
    };

    return results;
  })()`;

  // Set up continuous polling
  const interval = setInterval(async () => {
    console.log('\n--- Running diagnostic sweep ---');
    const result = await Runtime.evaluate({
      expression: testExpr,
      returnByValue: true
    });

    const data = result.result?.value;
    if (!data) {
      console.log('No diagnostic data returned');
      return;
    }

    console.log('\nSCOPE DETECTION:');
    Object.entries(data.scopes).forEach(([sel, info]) => {
      console.log(`  ${sel}: ${info.found ? '✓' : '✗'} (${info.tagName || 'none'})`);
    });

    console.log('\nASSISTANT MESSAGE DETECTION:');
    Object.entries(data.assistants).forEach(([sel, info]) => {
      console.log(`  ${sel}: ${info.count} matches`);
      if (info.count > 0) {
        console.log(`    Latest: "${info.lastOneText}"`);
      }
    });

    console.log('\nMARKDOWN DETECTION:');
    Object.entries(data.markdowns).forEach(([sel, info]) => {
      console.log(`  ${sel}: ${info.count} matches`);
      if (info.count > 0) {
        console.log(`    Latest: ${info.lastOneTextLength} chars`);
        console.log(`    Preview: "${info.lastOneText}"`);
      }
    });

    console.log('\nTOOLBAR STATUS:');
    Object.entries(data.toolbar).forEach(([sel, info]) => {
      console.log(`  ${sel}: ${info.found ? '✓' : '✗'}`);
      if (info.found) {
        console.log(`    data-loading: ${info.dataLoading}`);
        console.log(`    svg class: ${info.svgClass}`);
        console.log(`    svg aria-label: ${info.svgAriaLabel}`);
      }
    });

    console.log('\nVISIBLE MARKDOWN (in viewport):');
    if (data.visibleMarkdown.count > 0) {
      data.visibleMarkdown.elements.forEach((el: any, idx: number) => {
        console.log(`  [${idx}] ${el.tagName} ${el.classList.join(' ')}`);
        console.log(`      ${el.textLength} chars - "${el.textPreview}"`);
      });
    } else {
      console.log('  No visible markdown found');
    }

    console.log('\nWaiting 5 seconds for next sweep...');
    console.log('💡 After typing: open dev-tools yourself to inspect the DOM and note down');
    console.log('   the EXACT selectors that match your conversation thread!');
  }, 5000);

  console.log('\n⏰ Diagnostic started. Press Ctrl+C to stop.');

  // Keep running until user interrupts
  process.on('SIGINT', async () => {
    console.log('\nStopping diagnostics...');
    clearInterval(interval);
    await chrome_client.closeBrowser();
    console.log('Diagnostics complete');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});