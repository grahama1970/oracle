console.log("=== RUNNING Quick Copilot Flow Check ===\n");

/**
 * Quick check if we can:
 * 1. See the current page and model
 * 2. Check if Copilot input is ready
 * 3. Detect if we already have a response
 */

// Check what's currently on screen
function analyzeCurrentState() {
  // Check page and model
  const currentPage = {
    url: window.location.href,
    title: document.title,
    isCopilot: document.querySelector('#copilot-chat-textarea') !== null
  };

  // Check model
  const modelButton = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
  const currentModel = {
    found: !!modelButton,
    modelText: modelButton?.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim(),
    fullText: modelButton?.textContent?.trim()
  };

  // Check for any Copilot response on the page
  const assistantMessages = document.querySelectorAll('[data-message-role="assistant"], div[class*="assistant"], div[class*="BotMessage"], div.markdown-body[id*="assistant"]');

  const allMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
  const visibleMarkdown = Array.from(allMarkdown).filter(el => (el.innerText || "").trim().length > 0);

  const lastResponse = visibleMarkdown.length > 0 ? visibleMarkdown.at(-1) : null;

  const responseInfo = {
    hasMessages: assistantMessages.length > 0,
    foundMarkdown: visibleMarkdown.length,
    lastResponseChars: lastResponse ? lastResponse.innerText.length : 0,
    lastResponsePreview: lastResponse ? lastResponse.innerText.substring(0, 200) + "..." : null
  };

  // Check if we can actually type
  const inputArea = document.querySelector('#copilot-chat-textarea');
  const uiReady = {
    inputFound: !!inputArea,
    inputEnabled: inputArea && !inputArea.disabled,
    inputHasText: inputArea && inputArea.value.length > 0
  };

  return {
    currentPage,
    currentModel,
    responseInfo,
    uiReady
  };
}

const state = analyzeCurrentState();
console.log("📁 Current Page:", state.currentPage);
console.log("(✅ Current Model:", state.currentModel);
console.log("💬 Response Status:", state.responseInfo);
console.log("⌨️ Input Status:", state.uiReady);

// If we have a response, analyze it
if (state.responseInfo.lastResponseChars > 0) {
  console.log("\n🎯 ANALYZING EXISTING RESPONSE:");

  const fullText = document.querySelector("div.markdown-body")?.innerText || "";

  const analysis = {
    totalChars: fullText.length,
    hasPatch: fullText.includes("*** Begin Patch") || fullText.includes("```diff"),
    hasClarifying: fullText.includes("## Clarifying"),
    hasFileRefs: /\w+\.\w+(?::\d+)?/.test(fullText),
    hasCodeBlocks: fullText.includes("---") && fullText.includes("+++"),
    hasChanges: fullText.includes("+ ") || fullText.includes("- ")
  };

  console.log("\nResponse Analysis:");
  Object.entries(analysis).forEach(([key, value]) => {
    console.log(`  ${key}: ${value ? '✅' : '❌'}`);
  });

  console.log("\nFirst 300 chars:");
  console.log(fullText.substring(0, 300) + "...");
}

// Summary
console.log("\n🎯 SUMMARY:");
if (state.uiReady.inputEnabled) {
  console.log("✅ Can input text to Copilot");
}
if (state.responseInfo.lastResponseChars > 500) {
  console.log("✅ Decent length response found");
}
if (state.responseInfo.hasMessages && state.responseInfo.lastResponseChars > 0) {
  console.log("✅ Full assistant response detected");
}

if (state.currentModel.currentModelText) {
  console.log(`⚠️ Current model: ${state.currentModel.currentModelText}`);
  if (state.currentModel.currentModelText.includes('mini')) {
    console.log(">👉 Might want to switch to full GPT-5 for longer responses");
  }
}

console.log("\nNext step: Try sending a prompt to test the complete flow");