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
  const normalizedTarget = targetModel.toLowerCase().replace(/\s+/g, '');

  return `(() =\u003e {
    // Helper functions from your proven debug script
    const findModelButton = () =\u003e {
      // Use exact class name as discovered
      const modelButton = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
      return modelButton;
    };

    const clickOption = (modelName) =\u003e {
      // Use exact selectors from your working code
      const options = document.querySelectorAll('li.prc-ActionList-ActionListItem-uq6I7');

      for (const option of options) {
        // Target innermost span exactly as you did
        const modelNameSpan = option.querySelector('.prc-ActionList-ItemLabel-TmBhn > span');
        const text = modelNameSpan?.textContent?.trim();

        if (text && text.includes(modelName)) {
          option.click();
          return true;
        }
      }
      return false;
    };

    const findModelButton = () =\u003e {
      return document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
    };

    // Main logic
    const modelButton = findModelButton();
    if (!modelButton) {
      return { status: 'button-missing' };
    }

    // Check current model (using your selector)
    const currentModelText = modelButton.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
    if (currentModelText && currentModelText.toLowerCase().includes(normalizedTarget)) {
      return { status: 'already-selected', label: currentModelText };
    }

    // Click to open dropdown
    modelButton.click();

    // Wait for dropdown to appear (your pattern)
    return new Promise((resolve) =\u003e {
      setTimeout(() =\u003e {
        // Find the right option
        let found = false;

        // Map target models (GPT-5 Pro -> GPT-4o for matching complexity)
        const targetNames = {
          'gpt-5': 'GPT-4o',
          'gpt-5-pro': 'GPT-4o',
          'gpt-5-mini': 'GPT-4o-mini'
        };

        const searchName = targetNames[normalizedTarget] || targetModel.replace(/\s+/g, '');

        if (clickOption(searchName)) {
          // Wait for selection to take effect
          setTimeout(() =\u003e {
            const currentModel = modelButton.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
            document.body.click(); // Close dropdown
            resolve({ status: 'switched', label: currentModel || targetModel });
          }, 1000);
        } else {
          // Option not found - close dropdown
          document.body.click();
          resolve({ status: 'option-not-found' });
        }
      }, 3000); // Your 3-second delay
    });
  })()`;
}