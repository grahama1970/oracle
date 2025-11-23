import type { ChromeClient, BrowserLogger } from '../types.js';

export async function ensureCopilotModelSelection(
  Runtime: ChromeClient['Runtime'],
  desiredModel: string,
  logger: BrowserLogger,
) {
  const outcome = await Runtime.evaluate({
    expression: buildCopilotModelSelectionExpression(desiredModel),
    awaitPromise: true,
    returnByValue: true,
  });

  const result = outcome.result?.value as
    | { status: 'already-selected'; label?: string | null }
    | { status: 'switched'; label?: string | null }
    | { status: 'option-not-found' }
    | { status: 'button-missing' }
    | { status: 'no-model-picker' }
    | undefined;

  switch (result?.status) {
    case 'already-selected':
    case 'switched': {
      const label = result.label ?? desiredModel;
      logger(`Copilot model: ${label}`);
      return;
    }
    case 'option-not-found': {
      logger(`Copilot model "${desiredModel}" not found, using default`);
      return;
    }
    case 'button-missing':
    case 'no-model-picker': {
      logger('Copilot model picker not found, using current selection');
      return;
    }
  }
}

function buildCopilotModelSelectionExpression(targetModel: string): string {
  const targetLiteral = JSON.stringify(targetModel.trim());
  return `(() => {
    const TARGET = ${targetLiteral};
    const TARGET_LOWER = TARGET.toLowerCase();
    
    // Robust selectors for model picker
    const BUTTON_SELECTORS = [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label="Model picker"]',
      'button[aria-label="Model"]',
      'button:has(svg.octicon-sparkle)'
    ];
    
    const OPTION_SELECTORS = [
      '[role="menuitemradio"]',
      '[role="menuitem"]',
      'button[role="menuitem"]'
    ];

    const findModelButton = () => {
      for (const sel of BUTTON_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn) return btn;
      }
      return null;
    };

    const readCurrentLabel = (button) => {
      if (!button) return '';
      // Try to find text within the button, ignoring screen reader text if possible
      return button.textContent?.trim() ?? '';
    };

    const closeDropdown = () => {
      const body = document.body;
      if (body && typeof body.click === 'function') {
        body.click();
      }
    };

    const modelButton = findModelButton();
    if (!modelButton) {
      return { status: 'button-missing' };
    }

    const currentLabel = readCurrentLabel(modelButton);
    // Simple check: if current label contains target (e.g. "GPT-5"), assume it's selected
    if (currentLabel && currentLabel.toLowerCase().includes(TARGET_LOWER)) {
      return { status: 'already-selected', label: currentLabel };
    }

    modelButton.click();

    const waitForOptions = () =>
      new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 30;
        const poll = () => {
          attempts += 1;
          
          // Find all potential options
          let options = [];
          for (const sel of OPTION_SELECTORS) {
            const found = document.querySelectorAll(sel);
            if (found.length > 0) {
              options = Array.from(found);
              break;
            }
          }

          if (options.length > 0) {
            for (const option of options) {
              const label = option.textContent?.trim();
              if (label && label.toLowerCase().includes(TARGET_LOWER)) {
                option.click();
                setTimeout(() => {
                  const updatedLabel = readCurrentLabel(findModelButton() || modelButton) || label;
                  closeDropdown();
                  resolve({ status: 'switched', label: updatedLabel });
                }, 200);
                return;
              }
            }
          }

          if (attempts >= maxAttempts) {
            closeDropdown();
            resolve({ status: 'option-not-found' });
            return;
          }
          setTimeout(poll, 150);
        };
        poll();
      });

    return waitForOptions();
  })()`;
}
