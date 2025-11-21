#!/usr/bin/env node

/**
 * Test Copilot model selection functionality
 */

import CDP from 'chrome-remote-interface';

const PORT = 36235;

const testExpr = `(() => {
  // Look for model selector elements
  const findModelButton = () => {
    // Look for model selector buttons or dropdowns
    const selectors = [
      'button[aria-label*="model" i]',
      'button[data-testid*="model" i]',
      'div[role="button"][aria-label*="Model" i]',
      '[data-copilot-header] button',
      '.copilot-header button',
      '.header button',
      'button:has-text("GPT")',
      'button span:contains("GPT")'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn) return btn;
    }

    // Look for text containing model names
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('gpt')) {
        return btn;
      }
    }

    return null;
  };

  const modelButton = findModelButton();
  if (modelButton) {
    return {
      found: true,
      buttonText: modelButton.textContent || '',
      buttonSelector: modelButton.tagName + (modelButton.id ? '#' + modelButton.id : '') +
                      (modelButton.className ? '.' + modelButton.className.split(' ').filter(c => c).join('.') : '')
    };
  }

  return { found: false, message: 'No model selector found' };
})()`;

async function main() {
  console.log('Testing Copilot model selector...\n');

  const client = await CDP({ port: PORT, host: '127.0.0.1' });
  const { Runtime } = client;

  await Runtime.enable();

  // Get current page info
  const pageInfo = await Runtime.evaluate({
    expression: '({ url: window.location.href, title: document.title, modelText: document.querySelector("#model-selector, .model-selector")?.textContent })',
    returnByValue: true
  });

  console.log('Current page:', pageInfo.result.value);

  // Look for model selector
  const result = await Runtime.evaluate({
    expression: testExpr,
    returnByValue: true
  });

  const data = result.result?.value || {};
    console.log('\n✅ Model selector found!');
    console.log('Button text:', data.buttonText.trim());
    console.log('Button selector:', data.buttonSelector);

    // Check if we can see all model options
    const modelsExpr = `(() => {
      // Click the model button if needed
      const btn = document.querySelector('button:has-text("${data.buttonText.trim()}")');
      if (btn) btn.click();

      // Wait a bit and then look for options
      setTimeout(() => {
        const options = [];
        const optionsSelectors = [
          '[role="option"]',
          '[role="menuitem"]',
          'button:has-text("GPT")',
          '[data-testid*="model" i] span'
        ];

        for (const selector of optionsSelectors) {
          const items = document.querySelectorAll(selector);
          items.forEach(item => {
            const text = item.textContent?.trim();
            if (text && (text.includes('GPT') || text.includes('model'))) {
              options.push({ text, selector });
            }
          });
        }

        return options;
      }, 500);

      return [];
    })()`;

    const optionsResult = await Runtime.evaluate({
      expression: modelsExpr,
      returnByValue: true
    });

    console.log('\nAvailable models:', optionsResult.result?.value || []);

  } else {
    console.log('❌', data.message);
  }

  await client.close();
}

main().catch(console.error);