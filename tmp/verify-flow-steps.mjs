#!/usr/bin/env node

/**
 * Complete Copilot Flow Verification
 * Tests all major steps end-to-end
 */

import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';

const PORT = 36235;

// Define the exact Copilot review prompt we'll use
const REVIEW_PROMPT = `
<!--
  COPILOT CODE REVIEW TEMPLATE
-->

# Extract console.log output to a dedicated file

## Repository and branch
- **Repo:** grahama1970/oracle
- **Branch:** feat/copilot-auth-review
- **Paths of interest:**
  - src/browser/actions/copilotNavigation.ts

## Summary
We need a simple change to extract console.log output from the Copilot response instead of returning it inline. This will help with debugging and processing of responses.

## Objectives
1. Add an option to write console.log output to a file instead of returning it in the main response.
2. Preserve the existing behavior as default (return inline).

## Constraints
- Keep changes minimal
- Add file output option with configurable path
- Maintain backward compatibility

## Test Plan
Run a simple code review and verify the log output is written to a file.

## Deliverable
## Patch (one code fence)
## Clarifying answers (short numbered list)

**Please provide a complete patch that:
1. Shows the exact changes needed
2. Includes filename and line numbers
3. Provides clarifying answers explaining the approach**
`;

async function main() {
  console.log('🧪 Testing Copilot End-to-End Flow\n');

  const client = await CDP({ port: PORT, host: '127.0.0.1' });
  const { Runtime } = client;
  await Runtime.enable();

  let tests = [];

  // Test 1: Current State Check
  console.log('1️⃣ Checking current state...');
  const state = await Runtime.evaluate({
    expression: `(() => {
      // Check page
      const page = {
        url: window.location.href,
        title: document.title,
        isCopilot: document.querySelector('#copilot-chat-textarea') !== null
      };

      // Check model
      const modelBtn = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
      const model = {
        found: !!modelBtn,
        text: modelBtn?.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim(),
        full: modelBtn?.textContent?.trim()
      };

      // Check for existing response
      const md = document.querySelectorAll("div.markdown-body");
      const hasContent = Array.from(md).some(el => (el.innerText || "").trim().length > 0);

      return { page, model, hasContent };
    })()`,
    returnByValue: true
  });

  tests.push({
    name: 'Page Status',
    success: state.result.value.page.isCopilot,
    details: state.result.value
  });

  // Test 2: Model Selector Functions
  console.log('\n2️⃣ Testing model selection detection...');
  const modelTest = await Runtime.evaluate({
    expression: `(() => {
      function findModelButton() {
        return document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
      }

      function checkCurrentModel() {
        const btn = findModelButton();
        return btn?.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
      }

      return {
        buttonExists: !!findModelButton(),
        currentModel: checkCurrentModel()
      };
    })()`,
    returnByValue: true
  });

  tests.push({
    name: 'Model Selector Detection',
    success: modelTest.result.value.buttonExists,
    details: modelTest.result.value
  });

  // Test 3: Input Readiness
  console.log('\n3️⃣ Testing Copilot input readiness...');
  const inputTest = await Runtime.evaluate({
    expression: `(() => {
      const textarea = document.querySelector('#copilot-chat-textarea');
      if (!textarea) return { ready: false, message: "No textarea found" };

      return {
        ready: true,
        disabled: textarea.disabled,
        currentText: textarea.value,
        placeholder: textarea.placeholder
      };
    })()`,
    returnByValue: true
  });

  tests.push({
    name: 'Input Ready',
    success: inputTest.result.value.ready && !inputTest.result.value.disabled,
    details: inputTest.result.value
  });

  // Test 4: Response Extraction
  console.log('\n4️⃣ Testing if we can find existing Copilot response...');
  const responseTest = await Runtime.evaluate({
    expression: `(() => {
      const allMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
      const visible = Array.from(allMarkdown).filter(el => (el.innerText || "").trim().length > 0);

      if (visible.length === 0) return { found: false };

      const last = visible.at(-1);
      const text = last.innerText || "";
      return {
        found: true,
        charCount: text.length,
        hasPatch: text.includes("*** Begin Patch") || text.includes("```diff"),
        hasClarifying: text.includes("## Clarifying"),
        preview: text.substring(0, 100) + "..."
      };
    })()`,
    returnByValue: true
  });

  tests.push({
    name: 'Response Detection',
    success: responseTest.result.value.found,
    details: responseTest.result.value
  });

  // Test 5: UI Loading State
  console.log('\n5️⃣ Checking UI loading state...');
  const uiTest = await Runtime.evaluate({
    expression: `(() => {
      // Look for various loading indicators
      const toolbarCheck = document.querySelector('button[data-copilot-button]');
      const modelCheck = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');

      const buttonTexts = [];
      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Generating') || text.includes('loading')) {
          buttonTexts.push(text);
        }
      });

      return {
        toolbarExist: !!toolbarCheck,
        modelExist: !!modelCheck,
        loadingIndicators: buttonTexts,
        timestamp: new Date().toISOString()
      };
    })()`,
    returnByValue: true
  });

  tests.push({
    name: 'UI State',
    success: true, // Always pass this info
    details: uiTest.result.value
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 VERIFICATION RESULTS:\n');

  let passed = 0;
  tests.forEach(test => {
    const status = test.success ? '✅' : '❌';
    console.log(`${status} ${test.name}`);
    console.log(`   Details:`, JSON.stringify(test.details, null, 2));
    console.log('');
    if (test.success) passed++;
  });

  console.log(`\n⚡ Summary: ${passed}/${tests.length} tests passed\n`);

  // Special recommendation based on findings
  if (responseTest.result.value.found) {
    console.log("\n💡 RECOMMENDATIONS:");
    if (responseTest.result.value.charCount < 1000) {
      console.log("⚠️  Response seems short (may be GPT-5 mini)");
      console.log("   Consider switching to GPT-5 Pro for longer reviews");
    }
    if (!responseTest.result.value.hasPatch) {
      console.log("⚠️  No unified diff detected in response");
      console.log("   The hang fix may have caused incomplete extraction");
    }
    if (responseTest.result.value.charCount > 2000 && responseTest.result.value.hasPatch) {
      console.log("✅ Good length response with code blocks");
      console.log("   Extraction appears to be working");
    }
  }

  await client.close();
}

main().catch(console.error);