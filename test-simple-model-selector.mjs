#!/usr/bin/env node

/**
 * Simple test to find Copilot model selector
 */

import CDP from 'chrome-remote-interface';

const PORT = 36235;

async function main() {
  console.log('Searching for Copilot model selector...\n');

  const client = await CDP({ port: PORT, host: '127.0.0.1' });
  const { Runtime } = client;

  await Runtime.enable();

  // Check what's visible about the model
  const checkExpr = `(() => {
    const results = [];

    // Look for any text containing "GPT" or "model"
    const allButtons = document.querySelectorAll('button, [role="button"]');
    allButtons.forEach(btn => {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('gpt') || text.includes('model')) {
        results.push({
          tag: btn.tagName,
          id: btn.id,
          className: btn.className,
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label')
        });
      }
    });

    // Also look in the header area
    const headers = document.querySelectorAll('header, [role="header"], .header');
    headers.forEach(header => {
      const text = header.textContent?.toLowerCase() || '';
      if (text.includes('gpt') || text.includes('model')) {
        results.push({
          location: 'header',
          text: header.textContent?.trim()
        });
      }
    });

    // Look for aria-label attributes
    const labeledElements = document.querySelectorAll('[aria-label]');
    labeledElements.forEach(el => {
      const label = el.getAttribute('aria-label')?.toLowerCase();
      if (label && (label.includes('gpt') || label.includes('model'))) {
        results.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          ariaLabel: label
        });
      }
    });

    return { found: results.length > 0, results };
  })()`;

  const result = await Runtime.evaluate({
    expression: checkExpr,
    returnByValue: true
  });

  const data = result.result?.value;

  console.log('Results:', JSON.stringify(data, null, 2));

  await client.close();
}

main().catch(console.error);