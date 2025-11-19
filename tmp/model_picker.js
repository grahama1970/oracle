function findModelButton() {
  return document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
}

async function selectModel(modelName, delayMs = 3000) { // Increased default delayMs
  const modelButton = findModelButton();
  if (!modelButton) {
    console.log('Model picker button not found');
    return;
  }

  modelButton.click();
  console.log(`Opening model picker… (looking for "${modelName}")`);

  await new Promise(resolve => setTimeout(resolve, delayMs)); // Wait for dropdown to render

  const options = document.querySelectorAll('li.prc-ActionList-ActionListItem-uq6I7');

  if (options.length === 0) {
    console.log('No model options found after opening dropdown.');
    document.body.click(); // Close dropdown
    return;
  }

  let foundOption = false;
  let loggedOptions = []; // To store options for logging if target not found

  for (const option of options) {
    // Correctly target the innermost span containing the model name
    const modelNameSpan = option.querySelector('.prc-ActionList-ItemLabel-TmBhn > span');
    const text = modelNameSpan?.textContent?.trim();

    loggedOptions.push(text || '[No text found]'); // Store for potential logging

    if (text && text.includes(modelName)) {
      console.log('Found and clicking option:', text);
      option.click();
      foundOption = true;

      await new Promise(resolve => setTimeout(resolve, 500)); // Increased wait for selection

      const current = findModelButton();
      const currentModelText = current?.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
      console.log('Current model:', currentModelText || '(unknown)');
      document.body.click(); // Ensure dropdown is closed
      break;
    }
  }

  if (!foundOption) {
    console.log(`Model option "${modelName}" not found; logging available options:`);
    loggedOptions.forEach((text) => console.log('-', text));
    document.body.click(); // Close dropdown if option not found
  }
}

function checkCurrentModel() {
  const modelButton = findModelButton();
  if (modelButton) {
    const currentModelText = modelButton.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
    console.log('Current model:', currentModelText ?? '(not found)');
  } else {
    console.log('Model button not found');
  }
}

// Example usage:
selectModel('GPT-4o', 3000); // Try to select 'GPT-4o' with a longer initial delay
checkCurrentModel();