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
    const BUTTON_SELECTOR = 'button.ModelPicker-module__menuButton--w_ML2';
    const BUTTON_LABEL_SELECTOR = '.ModelPicker-module__buttonName--Iid1H';
    const OPTION_SELECTOR = 'li.prc-ActionList-ActionListItem-uq6I7';
    const OPTION_LABEL_SELECTOR = '.prc-ActionList-ItemLabel-TmBhn > span';

    const findModelButton = () => document.querySelector(BUTTON_SELECTOR);
    const readCurrentLabel = (button) => button?.querySelector(BUTTON_LABEL_SELECTOR)?.textContent?.trim() ?? '';
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
    if (currentLabel && currentLabel.toLowerCase() === TARGET_LOWER) {
      return { status: 'already-selected', label: currentLabel };
    }

    modelButton.click();

    const waitForOptions = () =>
      new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 30;
        const poll = () => {
          attempts += 1;
          const options = Array.from(document.querySelectorAll(OPTION_SELECTOR));
          if (options.length > 0) {
            for (const option of options) {
              const label = option.querySelector(OPTION_LABEL_SELECTOR)?.textContent?.trim();
              if (label && label.toLowerCase() === TARGET_LOWER) {
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
