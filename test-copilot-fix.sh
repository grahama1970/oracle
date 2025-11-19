#!/bin/bash
# Test script to verify the Copilot response fix

set -e

echo "=== Testing Copilot Response Fix ==="
echo "Current branch: $(git branch --show-current)"
echo "Recent commits:"
git log --oneline -5

echo -e "\n=== Running copilot code review ==="
cd /home/graham/workspace/experiments/oracle

# Create a simple test template if it doesn't exist
TEST_TEMPLATE="/home/graham/workspace/experiments/oracle/tmp/test-copilot-review.md"
cat > "$TEST_TEMPLATE" << 'EOF'
# Code Review Request

Please review the following code changes:

```diff
--- src/browser/actions/copilotNavigation.ts.orig
+++ src/browser/actions/copilotNavigation.ts
@@ -405,7 +405,41 @@
     if (!isTyping && uiDone && hasMarkdown && confirmText.length > 0) {
-      // If UI shows "done" and we have any markdown, exit immediately to avoid hangs.
-      logger('Copilot response complete ✓ (UI done / markdown present)');
-      return { text: confirmText || text, html };
+      const enoughStableCycles =
+        chars >= minCharsForLongAnswer
+          ? stableCycles >= longAnswerStableCycles
+          : stableCycles >= requiredStableCycles;
+
+      // If UI shows "done" and we have non-empty markdown, exit immediately.
+      if (chars >= minCharsForEarlyExit) {
+        logger('Copilot response complete ✓ (UI done immediate)');
+        return { text: confirmText, html };
+      }
+
+      // UI reports done + non-empty markdown: bail out immediately to avoid hangs.
+      if (stableCycles === 0 && elapsed > 2_000) {
+        logger('Copilot response complete ✓ (UI done immediate)');
+        return { text: confirmText, html };
+      }
+
+      // Heuristic: if the text contains explicit patch markers, accept sooner.
+      if (patchMarkersPresent && (stableCycles >= 1 || elapsed > earlyUiDoneFallbackMs)) {
+        logger('Copilot snapshot stabilized (patch markers)');
+        logger('Copilot response complete ✓ (early patch heuristic)');
+        return { text: confirmText, html };
+      }
+
+      // Standard stability path.
+      if (enoughStableCycles) {
+        logger('Copilot snapshot stabilized');
+        logger('Copilot response complete ✓');
+        return { text: confirmText, html };
+      }
+
+      // Inactivity fallback: UI done + no changes for a while.
+      if (elapsed - lastChangeAt > earlyUiDoneFallbackMs / 2 && chars > 100) {
+        logger('Copilot snapshot stabilized (inactivity)');
+        logger('Copilot response complete ✓ (inactivity fallback)');
+        return { text: confirmText, html };
+      }
+
+      // Safety valve: if UI says done and we have non-empty markdown,
+      // do not wait indefinitely for perfect stability.
+      if (elapsed > 15_000 && chars > minCharsForEarlyExit) {
+        logger('Copilot response complete ✓ (early exit after UI done)');
+        return { text: confirmText, html };
+      }
 ```

Please provide a review of these changes focusing on:
1. The fix for the early return bug
2. Additional exit conditions added
3. Code structure and maintainability

If you find any issues, please provide a patch with the fixes.
EOF

echo "Starting Copilot review test..."
echo "Config:"
echo "  - Template: $TEST_TEMPLATE"
echo "  - Model: GPT-5 (default)"
echo "  - Max turns: 3"
echo "  - Apply mode: none"

pnpm tsx scripts/copilot-code-review.ts "$TEST_TEMPLATE" \
  --max-turns 3 \
  --apply-mode none

echo -e "\n=== Test completed ==="

# Check if output was generated
if [ -f "tmp/test-copilot-review-turn-1.patch" ]; then
  echo "✓ Found patch file - Copilot responded successfully!"
  echo "Patch file contents:"
  cat "tmp/test-copilot-review-turn-1.patch"
elif [ -f "tmp/test-copilot-review-no-diff.txt" ]; then
  echo "✓ Copilot responded but no diff was found (check response file)"
  echo "Response preview:"
  head -50 "tmp/test-copilot-review-no-diff.txt"
else
  echo "✗ No output files found - Copilot may still be hanging"
fi

echo -e "\nTo check the debug logs:"
echo "tail -f tmp/copilot-review-latest.log"