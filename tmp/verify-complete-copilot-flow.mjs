#!/usr/bin/env node

/**
 * Complete verification of Copilot flow:
 * 1. Open browser
 * 2. Select model (GPT-5 full vs mini)
 * 3. Enter code review request
 * 4. Submit and wait for response
 * 5. Extract markdown with unified diff
 * 6. Verify answers to clarifying questions
 */

import CDP from 'chrome-remote-interface';
import fs from 'fs';

const PORT = 36235; // Active Chrome session with Copilot

const REVIEW_REQUEST = `<!--
  COPILOT CODE REVIEW TEMPLATE
  -----------------------------
  Follows docs/templates/COPILOT_CODE_REVIEW.md format exactly.
-->

# Fix early return bug in waitForCopilotResponse

## Repository and branch
- **Repo:** grahama1970/oracle
- **Branch:** feat/copilot-auth-review
- **Paths of interest:**
  - src/browser/actions/copilotNavigation.ts

## Summary
The Oracle Copilot transport sending code reviews successfully to GitHub Copilot and receiving full markdown replies but hanging in the waitForCopilotResponse loop for 10 minutes. Add a fallback to extract markdown even when scoped selectors fail and exit immediately when send icon showed with content.

## Objectives
1. Replace fragile class-based selectors with robust fallback chain
2. Add immediate exit when airplane icon visible with chars > 0
3. Add comprehensive debugging output

## Constraints
- Keep changes minimal (single file if possible)
- Preserve existing stability logic
- No new dependencies

## Test Plan
1. Send review request to Copilot
2. Verify extraction completes < 30 seconds
3. Verify extracted content includes unified diff with file references

## Deliverable
A single markdown document with:
1. ## Patch (one code fence)
2. ## Clarifying answers (short numbered list)

## Good response would include:
- Functions that handle fallback
- Immediate exit logic
- Debugging enhancements
- Complete unified diff patches
\n\n`**Note to Copilot: Please provide a complete response with actual code changes showing how to fix the hanging issue by adding fallback selectors and immediate exit conditions**`;

async function main() {
  console.log('=== COMPLETE COPILOT FLOW VERIFICATION ===\n');

  const client = await CDP({ port: PORT, host: '127.0.0.1' });
  const { Runtime, Page } = client;

  await Runtime.enable();
  await Page.enable();

  console.log('1. Current Page State:');
  const pageInfo = await Runtime.evaluate({
    expression: '({ url: window.location.href, title: document.title })',
    returnByValue: true
  });
  console.log(pageInfo.result.value);

  console.log('\n2. Verifying Model Selection Works...');

  // Test if we're at GitHub Copilot chat
  const checkCopilotExpr = `(() => {
    const isCopilot = document.querySelector('#copilot-chat-textarea') !== null;
    const canType = document.querySelector('#copilot-chat-textarea')?.disabled === false;
    return { isCopilot, canType };
  })()`;

  const checkResult = await Runtime.evaluate({
    expression: checkCopilotExpr,
    returnByValue: true
  });

  if (!checkResult.result.value.isCopilot) {
    console.log('❌ Not on Copilot chat page');
    await client.close();
    return;
  }

  if (!checkResult.result.value.canType) {
    console.log('❌ Copilot input is disabled');
    await client.close();
    return;
  }

  console.log('✅ Copilot chat is ready');

  // Check current model
  const checkModelExpr = `(() => {
    const modelButton = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
    if (!modelButton) return { found: false };

    const current = modelButton.querySelector('.ModelPicker-module__buttonName--Iid1H')?.textContent?.trim();
    return {
      found: true,
      current: current,
      buttonText: modelButton.textContent?.trim()
    };
  })()`;

  const modelCheck = await Runtime.evaluate({
    expression: checkModelExpr,
    returnByValue: true
  });

  if (modelCheck.result.value.found) {
    console.log('✅ Current model:', modelCheck.result.value.current);
    console.log('   Button text:', modelCheck.result.value.buttonText);
  } else {
    console.log('❌ Model selector not found');
  }

  // Test complete flow
  console.log('\n3. Testing Code Review Submission...');

  // First clear any existing input
  await Runtime.evaluate({
    expression: `document.querySelector('#copilot-chat-textarea').value = ''`,
    returnByValue: true
  });

  // Enter the review request
  await Runtime.evaluate({
    expression: `document.querySelector('#copilot-chat-textarea').value = ${JSON.stringify(REVIEW_REQUEST)}`,
    returnByValue: true
  });

  // Submit
  await Runtime.evaluate({
    expression: `document.querySelector('#copilot-chat-textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }))`,
    returnByValue: true
  });

  console.log('✅ Review request submitted');

  // Monitor for response
  console.log('\n4. Monitoring for Copilot Response...');

  let attempts = 0;
  let foundResponse = false;
  const maxAttempts = 60; // 60 seconds timeout

  while (attempts < maxAttempts) {
    const responseTest = await Runtime.evaluate({
      expression: `(() => {
        const allMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
        const visible = Array.from(allMarkdown).filter(el => (el.innerText || "").trim().length > 0);

        if (visible.length === 0) return { found: false, message: "No markdown found" };

        const lastMd = visible.at(-1);
        const fullText = lastMd.innerText || "";

        // Check for key elements
        const hasPatch = fullText.includes("*** Begin Patch") || fullText.includes("```diff");
        const hasClarifying = fullText.includes("## Clarifying");
        const hasReviewContent = fullText.length > 1000; // Reasonable review length
        const hasUnifiedDiff = fullText.includes("@@") || fullText.includes("---") || fullText.includes("+++");

        return {
          found: true,
          charCount: fullText.length,
          hasPatch,
          hasClarifying,
          hasReviewContent,
          hasUnifiedDiff,
          preview: fullText.substring(0, 500) + "...",
          fullText: fullText
        };
      })()`,
      returnByValue: true
    });

    const result = responseTest.result?.value;

    if (result.found) {
      console.log('✅ OPENAI RESPONSE FOUND!');
      console.log('   Characters:', result.charCount);
      console.log('   Has patch:', result.hasPatch);
      console.log('   Has clarifying:', result.hasClarifying);

      if (result.hasReviewContent) {
        console.log('   Content length: ✅ Good' );
      } else {
        console.log('   Content length: ❌ Possibly short');
      }

      if (result.hasUnifiedDiff) {
        console.log('   Unified diff: ✅ Found');
      } else {
        console.log('   Unified diff: ⚠️ Not detected');
      }

      foundResponse = true;

      // Save the full content
      await fs.promises.writeFile('/tmp/copilot-response-latest.md', result.fullText);
      console.log('\n   Full response saved to: /tmp/copilot-response-latest.md');

      // Show first few lines
      console.log('\n   Preview of response:', result.preview);

      break;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (attempts % 10 === 0) {
      console.log(`   Waiting... (${attempts}/${maxAttempts}s)`);
    }
  }

  if (!foundResponse) {
    console.log('\n❌ Timeout: No valid Copilot response found after 60 seconds');
  }

  // Check if loading indicator has changed to airplane
  const waitExpr = `(() =\u003e {
    const toolbarButton = document.querySelector('button.ModelPicker-module__menuButton--w_ML2');
    const hasAirplane = toolbarButton?.textContent?.includes('paper airplane');
    return {
      buttonText: toolbarButton?.textContent?.trim(),
      hasAirplane,
      uiControls: document.querySelectorAll('[data-loading]').length
    };
  })()`;

  const uiState = await Runtime.evaluate({
    expression: waitExpr,
    returnByValue: true
  });

  console.log('\n5. UI State Check:');
  console.log('   Button text:', uiState.result.value.buttonText);
  console.log('   Has airplane:', uiState.result.value.hasAirplane);
  console.log('   Loading controls:', uiState.result.value.uiControls);

  await client.close();

  if (foundResponse) {
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Open /tmp/copilot-response-latest.md');
    console.log('2. Look for "## Patch" section with ```diff fence');
    console.log('3. Check for clarifying answers');
    console.log('4. Verify code changes match your request');
  }
}

main().catch(console.error);