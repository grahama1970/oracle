:alert("=== QUICK COPILOT FLOW CHECK ===");

/**
 * Run this in Chrome DevTools console on the Copilot page
 * Tests: model selection, input readiness, response detection
 */

(function() {
  console.log("\n" + "=".repeat(50));
  console.log("🔍 Cassandra Checking Flow Steps");
  console.log("=".repeat(50) + "\n");

  // Test 1: Page Check
  const pageInfo = {
    url: window.location.href,
    title: document.title,
    isCopilot: !!document.querySelector('#copilot-chat-textarea')
  };
  console.log("📁 Page Status:", pageInfo);
  console.log("✅ Page check:", pageInfo.isCopilot ? "PASS - is Copilot" : "FAIL - not Copilot");

  // Test 2: Model Detection
  try {
    const modelBtn = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
    const modelInfo = {
      found: !!modelBtn,
      currentModel: modelBtn?.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim(),
      fullButtonText: modelBtn?.textContent?.trim()
    };
    console.log("\n🎨 Model Detection:", modelInfo);
    console.log("✅ Model button:", modelInfo.found && modelInfo.currentModel ? "PASS - Found and readable" : "WARN - Button found but text issue");
  } catch (e) {
    console.log("❌ Model detection error:", e.message);
  }

  // Test 3: Input Check
  const input = document.querySelector('#copilot-chat-textarea');
  if (input) {
    const inputInfo = {
      enabled: !input.disabled,
      currentText: input.value || input.textContent,
      hasContent: (input.value || input.textContent).length > 0
    };
    console.log("\n⌨️ Input Status:", inputInfo);
    console.log("✅ Input ready:", inputInfo.enabled ? "PASS - Can type" : "FAIL - Disabled");
  } else {
    console.log("\n❌ Input text area not found");
  }

  // Test 4: Response Check
  const markdowns = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body");
  let responseInfo = { found: false, length: 0, hasPatch: false, hasDiff: false };

  if (markdowns.length > 0) {
    const last = markdowns[markdowns.length - 1];
    const text = last.innerText || last.textContent || "";
    responseInfo = {
      found: true,
      length: text.length,
      hasPatch: text.includes("*** Begin Patch"),
      hasDiff: text.includes("@@@"),
      preview: text.substring(0, 100) + "..."
    };
    console.log("\n💬 Response Detection:", responseInfo);
    console.log("✅ Response found:", responseInfo.length > 500 ? "PASS - Good length" : "WARN - Possibly short");
  } else {
    console.log("\n⚠️  No Copilot response found");
  }

  // Test 5: Quick Model Selection Test
  console.log("\n🔧 Model Selector Test:");
  try {
    const modelButton = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
    if (modelButton) {
      console.log("Clicking model button...");
      modelButton.click();

      // After short delay, check if dropdown opened
      setTimeout(() => {
        const options = document.querySelectorAll('li.prc-ActionList-ActionListItem-uq6I7');
        const models = Array.from(options).map(opt =>
          opt.querySelector('.prc-ActionList-ItemLabel-TmBhn > span')?.textContent?.trim()
        ).filter(Boolean);

        console.log("Available models:", models);
        console.log("=available=Option count:", options.length);

        // Close if needed
        document.body.click();
      }, 1000);
    }
  } catch (e) {
    console.log("❌ Model selector test error:", e.message);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✨ Summary: Copy/paste this verification completes.");
  console.log("Next: Try sending a prompt to test dynamic response!");
  console.log("=".repeat(50));
})();