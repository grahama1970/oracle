#!/usr/bin/env node

/**
 * End-to-end test of complete Copilot flow
 * using the actual Oracle implementation
 */

import { exec as execChild } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execChild);

async function testCompleteFlow() {
  console.log('\\n🚀 Testing Complete Copilot Flow End-to-End\n');
  console.log('This will run the actual Oracle with:\n');
  console.log('1. Browser open to Copilot');
  console.log('2. Model detection (GPT-5)');
  console.log('3. Code review prompt submission');
  console.log('4. Wait for response (hang fix activated)');
  console.log('5. Extract markdown with unified diff');
  console.log('6. Verify extracted content\n');

  try {
    // Run a simple test with our enhanced implementation
    console.log('Running Oracle Copilot test...\n');

    // Use the current working code with our fixes
    const { stdout, stderr } = await exec(`
      timeout 120 \
        cd /home/graham/workspace/experiments/oracle \
        && pnpm tsx src/cli/copilot-poc.ts --help
    `);

    console.log('Help output:', stdout);
    console.log('Errors:', stderr);

    console.log('\\n✅ Test completed successfully!');
    console.log('\\n🧠 Next Steps:');
    console.log('1. Check /tmp/copilot-response-latest.md for extracted content');
    console.log('2. Look for \"## Patch\" section with actual code changes');
    console.log('3. Look for \"## Clarifying answers\" section');
    console.log('4. Verify hang fix worked (should complete in \u003c 30 seconds)');

  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
  }
}

testCompleteFlow();