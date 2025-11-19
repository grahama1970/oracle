#!/usr/bin/env node

/**
 * Test script to verify we can extract markdown content with unified diffs
 * and answers from GitHub Copilot
 */

import CDP from 'chrome-remote-interface';
import fs from 'fs';

const PORT = 36235; // Live Chrome session with Copilot

async function main() {
  console.log('=== Testing Copilot Markdown Extraction ===\n');

  let client;
  try {
    client = await CDP({ port: PORT, host: '127.0.0.1' });
    const { Runtime } = client;

    await Runtime.enable();

    // Get page info
    const pageInfo = await Runtime.evaluate({
      expression: '({ url: window.location.href, title: document.title })',
      returnByValue: true
    });

    console.log('Current page:', pageInfo.result.value);
    console.log('');

    // Extract markdown content - simple version
    const extractResult = await Runtime.evaluate({
      expression: `(() => {
        // Get all markdown bodies
        const allMarkdown = document.querySelectorAll("div.markdown-body[data-copilot-markdown], div.markdown-body, article.markdown");
        const visibleMarkdown = Array.from(allMarkdown).filter(el => (el.innerText || "").trim().length > 0);

        if (visibleMarkdown.length === 0) {
          return { found: false, message: "No markdown found" };
        }

        // Get the last (most recent) markdown content
        const lastMd = visibleMarkdown.at(-1);
        const fullText = lastMd.innerText || "";

        // Look for unified diff patterns
        const hasUnifiedDiff = fullText.includes("---") || fullText.includes("+++") || fullText.includes("@@");

        // Count code blocks by finding triple backticks
        const backtickCount = (fullText.match(/\`\`\`/g) || []).length;
        const codeBlockCount = Math.floor(backtickCount / 2); // Divided by 2 for opening/closing

        // Check for review elements
        const hasReviewElements = /(security|performance|maintainability|suggestion|improvement|issue|problem)/i.test(fullText);

        return {
          found: true,
          fullText: fullText,
          charCount: fullText.length,
          hasUnifiedDiff: hasUnifiedDiff,
          codeBlockCount: codeBlockCount,
          hasReviewElements: hasReviewElements,
          preview: fullText.substring(0, 300) + (fullText.length > 300 ? "..." : "")
        };
      })()`,
      returnByValue: true
    });

    const data = extractResult.result?.value;

    if (!data.found) {
      console.log('❌', data.message);
      return;
    }

    console.log('✅ Markdown content found!\n');
    console.log('Statistics:');
    console.log('-'.repeat(50));
    console.log(`Character count: ${data.charCount}`);
    console.log(`Has unified diff: ${data.hasUnifiedDiff ? 'YES' : 'NO'}`);
    console.log(`Code blocks found: ${data.codeBlockCount}`);
    console.log(`Has review elements: ${data.hasReviewElements ? 'YES' : 'NO'}`);
    console.log('');

    console.log('Preview (first 300 chars):');
    console.log('-'.repeat(50));
    console.log(data.preview);
    console.log('');

    // Save full content for inspection
    const outputFile = '/tmp/copilot-extracted-content.md';
    fs.writeFileSync(outputFile, data.fullText);
    console.log(`✅ Full content saved to: ${outputFile}`);

    // Check for specific review content patterns
    console.log('\nDetailed Analysis:');
    console.log('-'.repeat(50));

    // Look for actual diff content
    const hasActualDiff = data.fullText.includes("diff --git") ||
                         (data.fullText.includes("---") && data.fullText.includes("+++"));
    console.log(`Actual diff format: ${hasActualDiff ? '✅ Detected' : '❌ Not detected'}`);

    // Look for file changes
    const hasFileChanges = /\w+\.\w+(?::\d+)?/.test(data.fullText);
    console.log(`File references: ${hasFileChanges ? '✅ Detected' : '❌ Not detected'}`);

    // Look for code suggestions
    const hasCodeSuggestions = data.fullText.includes("+ ") || data.fullText.includes("- ");
    console.log(`Code suggestions (+/-): ${hasCodeSuggestions ? '✅ Detected' : '❌ Not detected'}`);

    // Look for review questions being answered
    const reviewQuestions = [
      'security issue',
      'performance',
      'maintainability',
      'code quality',
      'best practice',
      'improvement',
      'suggestion'
    ];

    const answeredQuestions = reviewQuestions.filter(q =>
      data.fullText.toLowerCase().includes(q)
    );

    if (answeredQuestions.length > 0) {
      console.log(`\n✅ Answering review questions about:`);
      answeredQuestions.forEach(q => console.log(`  - ${q}`));
    } else {
      console.log('\n⚠️  No clear review questions being answered');
    }

    await client.close();

  } catch (err) {
    console.error('Error:', err.message);
    if (client) await client.close();
  }
}

main().catch(console.error);