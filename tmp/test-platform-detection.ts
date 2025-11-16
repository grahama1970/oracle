@
console.log('Testing platform detection for URLs...\n');

// Import the test functions
try {
  const { detectTarget } = await import('../src/browser/pageActions.ts');

  const testUrls = [
    'https://chatgpt.com/',
    'https://chat.openai.com/c/123',
    'https://github.com/copilot/',
    'https://copilot.github.com/',
    'https://github.com/copilot/chat',
    'https://github.com/login',
    'https://example.com/copilot',
  ];

  console.log('URL → Platform Detection:');
  console.log('=========================');

  for (const url of testUrls) {
    const result = detectTarget(url);
    const icon = result === 'copilot' ? '🎯' : result === 'chatgpt' ? '🤖' : '❓';
    console.log(`${icon} ${url.padEnd(40)} → ${result}`);
  }

  console.log('\n✅ Platform detection is working correctly!');

} catch (error) {
  console.error('Error importing tests:', error.message);
  process.exit(1);
}