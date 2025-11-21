1. Reuse the existing relative path (current behavior) rather than introducing a tmp/browser subdir to avoid changing test expectations.
2. Stay silent on fallback (no logging) to keep output clean; optional debug logging can be added later if needed.

```diff
--- src/browser/utils.ts
+++ src/browser/utils.ts
@@ -155,7 +155,9 @@ export async function writeJsonOutput(filePath: string, payload: unknown): Promise<void> {
-  const fs2 = await import('node:fs/promises');
-  const path2 = await import('node:path');
-  const fallbackPath = path2.join(process.cwd(), filePath.replace(/^\/+/, ''));
+  const fs2 = await import('node:fs/promises');
+  const path2 = await import('node:path');
+  // Fallback strategy: reuse original relative path under CWD (no dedicated tmp subdir).
+  // Silent fallback: no logging to avoid noisy test output; consider adding debug logging if needed.
+  const fallbackPath = path2.join(process.cwd(), filePath.replace(/^\/+/, ''));
   const fallbackDir = path2.dirname(fallbackPath);
   await fs2.mkdir(fallbackDir, { recursive: true });
   await fs2.writeFile(fallbackPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
```
