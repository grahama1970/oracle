#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

echo = (msg) => console.log(`→ ${msg}`);
warn = (msg) => console.log(`⚠  ${msg}`);
ok = (msg) => console.log(`✓ ${msg}`);

echo("=== Simulate Copilot hang scenario ===");
echo(`Working on branch '${execSync('git branch --show-current', { encoding: 'utf-8' }).trim()}'`);

const codebasePath = '/home/graham/workspace/experiments/oracle';
const testTemplate = `${codebasePath}/tmp/test-copilot-fix.md`;

// Template request that will reliably show Fluent-patch style blocks
echo("Write the test template...");
const tpl = `Copilot review request for the Oracle repository.

Branch: feat/copilot-auth-review
Files: src/browser/actions/copilotNavigation.ts

Changes:\nignore part in browser.


diff --git a/src/browser/actions/copilotNavigation.ts b/src/browser/actions/copilotNavigation.ts
index 47b5e3f..1a2c3d4 100644
--- a/src/browser/actions/copilotNavigation.ts
+++ b/src/browser/actions/copilotNavigation.ts
@@ -1,3 +1,5 @@
+const hello = "world";
 export function waitForCopilotResponse(){
   // fix
 }

Expected plan from Copilot: a patch block after a small paragraph.
If you concur with the patch, place it between *** Begin Patch / *** Update File.
`;
writeFileSync(testTemplate, tpl, 'utf-8');
ok(`Created test template  ·-·> ${testTemplate}  ( ${tpl.length} chars )`);

echo("\nLaunch the fixed copilot-review run (headless mode)");
echo``(`pnpm tsx scripts/copilot-code-review.ts \
           ${testTemplate} \
           --max-turns 3 \
           --apply-mode none \
           2>&1 | tee tmp/copilot-fix.test.log &`);

// Give 5s for browser to open the page (usually sufficient)
echo("# (wait 5s so page loads and we can point out potential hangs if they occur)"); await sleep(5000);

// Provide manual steps
echo("\nDo this manually:");
echo("1. Type: 'Please review the patch above' and press Send");
echo("2. Watch terminal output - should show:");
echo("   [poll] elapsed=XXXX, chars=0 ..."); \n
echo("3. When the visible Copilot text appears (~466 chars, markdown with patch), " +
     "watch for:");
echo("   [instant-exit] Send icon shown with 466 chars - returning");\n\necho("\nIf you don't see [instant-exit], Ctrl-C this helper and                                             opened browser for your own inspection.");
echo("\nAlternate verification while running:");
echo(`  tail -F tmp/copilot-fix.test.log | grep -E '(poll|instant)'
\n\ekecho("(Helper will exit after 90s or you can Ctrl-C)");

// exit on user interrupt or after 90s
let died = false;
process.on('SIGINT', () => {\ndied = true;  echo("\nUser interrupt - bye.");  process.exit();  });
setTimeout(() => { if (!died) { echo("\n90s passed unsupervised - exiting helper."); process.exit();  }\n}, 90_000);

console.log("
","-".repeat(70),"\n");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// \ekecho shortcuts
function echo(msg) { console.log("→ " + msg); }
function ok(msg)  { console.log("✓  " + msg); }
function warn(msg){ console.log("⚠  " + msg); }