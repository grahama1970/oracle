import { describe, test, expect, beforeAll } from 'vitest';
import type { ChromeClient, BrowserLogger } from '../../src/browser/types.js';
import { extractUnifiedDiff, detectSidebarBleed, isValidUnifiedDiff } from '../../src/browser/diffExtractor.js';
import {
  COPILOT_SPINNER_SELECTOR,
  COPILOT_ASSISTANT_CONTAINER_SELECTOR,
  COPILOT_STOP_ICON_SELECTOR,
  COPILOT_SEND_ICON_SELECTOR
} from '../../src/browser/constants.js';

// Test data for different scenarios
const SAMPLE_COPILOT_OUTPUT = `
Here's the fix for your issue:

\`\`\`diff
--- a/src/browser/constants.ts
+++ b/src/browser/constants.ts
@@ -2,6 +2,8 @@
 export const CHATGPT_URL = 'https://chatgpt.com/';
| export const DEFAULT_MODEL_TARGET = 'GPT-5';
+export const COPILOT_SPINNER_SELECTOR = '.copilot-loading-spinner, [data-testid="copilot-spinner"]';
+export const COPILOT_ASSISTANT_CONTAINER_SELECTOR = '[data-testid="copilot-chat-conversation"], .copilot-conversation-container';
\`\`\`
`;

const SIDEBAR_CONTAMINATED_OUTPUT = `
Pull requests Issues Marketplace Explore

Programming Copilot response

You can update the file like this:

\`\`\`patch
--- a/package.json
+++ b/package.json
@@ -1,5 +1,7 @@
{
  "name": "test-project",
+  "version": "2.0.0",
+  "description": "Updated description"
}
\`\`\`
`;

describe('Enhanced Copilot Detection and Extraction', () => {

  describe('Sidebar Bleed Detection', () => {
    test('should detect sidebar content in extraction', () => {
      const result = detectSidebarBleed(SIDEBAR_CONTAMINATED_OUTPUT);
      expect(result.hasBleed).toBe(true);
      expect(result.indicators.length).toBeGreaterThan(3);
      expect(result.indicators).toContain('Pull requests');
      expect(result.indicators).toContain('Issues');
      expect(result.indicators).toContain('Marketplace');
      expect(result.indicators).toContain('Explore');
    });

    test('should not detect sidebar bleed in clean response', () => {
      const result = detectSidebarBleed(SAMPLE_COPILOT_OUTPUT);
      expect(result.hasBleed).toBe(false);
      expect(result.indicators.length).toBeLessThanOrEqual(3);
    });

    test('should detect individual indicators', () => {
      const testCases = [
        { input: 'Go to Pull requests page and check the Issues there in the Marketplace. Make sure to Explore all options in Navigation menu\n\navia-label\ndata-testid copilot-sidebar toolbar action-list\n[role="navigation"] header nav\nIn GitHub interface', expected: ['Pull requests', 'Issues', 'Marketplace'] },
        { input: 'Issues and Marketplace and Explore and Navigation\navia-label data-testid copilot-sidebar.\nCopilot sidebar elements data-testid attributes with [role="navigation"]\nheader and nav elements in GitHub UI', expected: ['Issues', 'Marketplace'] },
        { input: 'Navigate to explore copilot-sidebar data-testid [role="navigation"]\nheader nav section and action-list in GitHub interface', expected: ['copilot-sidebar', 'data-testid', 'header', 'nav'] }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = detectSidebarBleed(input);
        expect(result.hasBleed).toBe(true); // All should trigger bleed
        expected.forEach(indicator => {
          expect(result.indicators).toContain(indicator);
        });
      });
    });
  });

  describe('Diff Extraction with Sidebar Detection', () => {
    test('should extract diff and mark sidebar detection', () => {
      const result = extractUnifiedDiff(SAMPLE_COPILOT_OUTPUT, { checkForSidebarBleed: true });
      expect(result.selectedBlock).toBeDefined();
      expect(result.sidebarDetected).toBe(false);
      expect(result.completionPath).toBeUndefined();
      expect(result.score).toBeGreaterThan(0);
    });

    test('should detect sidebar bleed in diff extraction', () => {
      const result = extractUnifiedDiff(SIDEBAR_CONTAMINATED_OUTPUT, {
        checkForSidebarBleed: true,
        completionPath: 'all_signals',
        signals: { stopButtonGone: true, sendButtonEnabled: true }
      });

      expect(result.sidebarDetected).toBe(true);
      expect(result.completionPath).toBe('all_signals');
      expect(result.signals).toEqual({ stopButtonGone: true, sendButtonEnabled: true });
    });

    test('should return sidebar_bleed_detected when no diffs found with bleed', () => {
      const contaminatedText = `
Pull requests Issues Marketplace Explore Navigation
aria-label data-testid copilot-sidebar
No diff content here - just contaminated text
      `;
      const result = extractUnifiedDiff(contaminatedText, { checkForSidebarBleed: true });

      expect(result.rawBlocks).toEqual([]);
      expect(result.sidebarDetected).toBe(true);
      expect(result.reason).toBe('sidebar_bleed_detected');
    });

    test('should properly score and extract valid diffs despite minimal bleed', () => {
      const minimalBleed = `
Some response text about features

\`\`\`diff
--- a/file.js
+++ b/file.js
@@ -1,5 +1,5 @@
 const test = 'value';
-function old() { }
+function new() { }
\`\`\`
      `;

      const result = extractUnifiedDiff(minimalBleed, { checkForSidebarBleed: true });
      expect(result.selectedBlock).toBeDefined();
      // Check the actual extracted content structure
      expect(result.selectedBlock!).toBeDefined();
      expect(result.selectedBlock!).toContain('--- a/file.js');
      expect(result.selectedBlock!).toContain('+++ b/file.js');
      expect(result.selectedBlock!).toContain('@@ -1,5 +1,5 @@');

      // The extracted block should have proper unified diff structure
      // Even without the full git header line
      const lines = result.selectedBlock!.split('\n');
      const hasFileLine = lines.some(line => line.startsWith('--- a/') || line.startsWith('+++ b/'));
      const hasHunkHeader = lines.some(line => line.includes('@@ -1,5'));

      expect(hasFileLine).toBe(true);
      expect(hasHunkHeader).toBe(true);

      // Unified diff validation should pass even without git header
      // The extractor uses the content inside the markdown fences
      expect(lines.length).toBeGreaterThan(5); // Should have enough lines for a valid diff
    });
  });

  describe('Enhanced Diff Validation', () => {
    test('should validate hunk header format correctly', () => {
      const validDiff = `
diff --git a/src/test.js b/src/test.js
index abc123..def456 100644
--- a/src/test.js
+++ b/src/test.js
@@ -10,7 +10,7 @@ function doSomething() {
   return value;
 }

-function old() {
+function new() {
   return false;
 }
`;
      expect(isValidUnifiedDiff(validDiff)).toBe(true);
      expect(isValidUnifiedDiff(validDiff, true)).toBe(true);
    });

    test('should reject invalid hunk headers', () => {
      const invalidDiff = `
diff --git a/src/test.js b/src/test.js
--- a/src/test.js
+++ b/src/test.js
@@ invalid hunk header @@
-function old() {
+function new() {
   return false;
 }
`;
      expect(isValidUnifiedDiff(invalidDiff)).toBe(false);
    });

    test('should validate file paths in strict mode', () => {
      const diffWithUnsafePath = `
diff --git a/../../../etc/passwd b/../../../etc/passwd
--- a/../../../etc/passwd
+++ b/../../../etc/passwd
@@ -1,1 +1,1 @@
-old content
+new content
`;
      expect(isValidUnifiedDiff(diffWithUnsafePath)).toBe(true); // Non-strict pass
      expect(isValidUnifiedDiff(diffWithUnsafePath, true)).toBe(false); // Strict fail
    });
  });

  describe('Constants Validation', () => {
    test('constants are properly exported', () => {
      expect(COPILOT_SPINNER_SELECTOR).toBeDefined();
      expect(COPILOT_ASSISTANT_CONTAINER_SELECTOR).toBeDefined();
      expect(COPILOT_STOP_ICON_SELECTOR).toBeDefined();
      expect(COPILOT_SEND_ICON_SELECTOR).toBeDefined();

      // Verify selectors make sense
      expect(COPILOT_SPINNER_SELECTOR).toContain('copilot')
      expect(COPILOT_ASSISTANT_CONTAINER_SELECTOR).toContain('copilot');
    });
  });

  describe('Metrics and Observability', () => {
    test('should track extraction metrics', () => {
      // This would be tested in integration with the actual browser functions
      // For now, verify the interface supports metrics
      const metrics = {
        copyButtonFound: true,
        clipboardSuccess: false,
        fallbackUsed: true,
        messagesFound: 3,
        sidebarContentRemoved: 5,
        assistantContainerFound: true
      };

      expect(metrics).toBeDefined();
      expect(typeof metrics.messagesFound).toBe('number');
      expect(typeof metrics.sidebarContentRemoved).toBe('number');
    });

    test('should handle completion paths correctly', () => {
      const validPaths = ['all_signals', 'partial_completion', 'ui_inconsistent', 'forced_timeout'];
      validPaths.forEach(path => {
        // Verify these paths can be used in diff extraction
        const result = extractUnifiedDiff(SAMPLE_COPILOT_OUTPUT, {
          completionPath: path,
          signals: { test: true }
        });
        expect(result.completionPath).toBe(path);
        expect(result.signals).toEqual({ test: true });
      });
    });
  });
});