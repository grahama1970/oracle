import { describe, expect, test } from 'vitest';
import { extractUnifiedDiff, isValidUnifiedDiff } from '../../src/browser/diffExtractor.js';

const SAMPLE_DIFF = `
Here is your patch:

\`\`\`diff
diff --git a/foo.txt b/foo.txt
index 1111111..2222222 100644
--- a/foo.txt
+++ b/foo.txt
@@ -1,2 +1,3 @@
-old
+new
+line
\`\`\`
`;

describe('extractUnifiedDiff', () => {
  test('extracts the best-scoring unified diff block', () => {
    const result = extractUnifiedDiff(SAMPLE_DIFF);
    expect(result.selectedBlock).toBeDefined();
    expect(result.rawBlocks.length).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeGreaterThan(0);
  });

  test('returns reason=no_fenced_blocks when no fences exist', () => {
    const result = extractUnifiedDiff('no fences here');
    expect(result.selectedBlock).toBeUndefined();
    expect(result.reason).toBe('no_fenced_blocks');
  });

  test('marks partial fences when opening fence is present without closing', () => {
    const result = extractUnifiedDiff('```diff\ndiff --git a/a b/a');
    expect(result.selectedBlock).toBeUndefined();
    expect(result.reason).toBe('partial_fence');
  });
});

describe('isValidUnifiedDiff', () => {
  test('accepts a basic unified diff', () => {
    const result = extractUnifiedDiff(SAMPLE_DIFF);
    expect(isValidUnifiedDiff(result.selectedBlock, false)).toBe(true);
  });

  test('rejects non-diff content', () => {
    expect(isValidUnifiedDiff('not a diff at all', false)).toBe(false);
  });
});

