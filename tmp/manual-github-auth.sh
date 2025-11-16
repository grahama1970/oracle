#!/bin/bash

# Manual GitHub authentication script for Copilot POC
# This script opens Chrome in a way that allows manual GitHub login

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GitHub Authentication Setup for Copilot POC                 ║"
echo "║                                                              ║"
echo "║  Instructions:                                               ║"
echo "║  1. Chrome will open with a GitHub login page                ║"
echo "║  2. Log in with your GitHub credentials                      ║"
echo "║  3. Navigate to https://github.com/copilot/                 ║"
echo "║  4. Wait for Copilot to load (you may need to accept terms) ║"
echo "║  5. Close the browser window when done                       ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "💡 This will authenticate your Chrome Default profile for Copilot access"
echo ""

# Ensure Chrome isn't already running
if pgrep -f "google-chrome" > /dev/null; then
    echo "⚠️  Chrome is running. Closing it first..."
    pkill -f "google-chrome"
    sleep 2
fi

# Chrome profile path (find the correct one)
CHROME_PROFILE="$HOME/.config/google-chrome/Default"

echo "🚀 Launching Chrome with profile: $CHROME_PROFILE"
echo ""
echo "📧 After login, make sure to:"
echo "   - Accept any Copilot setup prompts"
echo "   - Keep the browser open until everything loads"
echo ""

# Launch Chrome in a visible window (not headless)
/usr/bin/google-chrome \
  --user-data-dir="$CHROME_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  --disable-blink-features=AutomationControlled \
  --password-store=basic \
  --start-maximized \
  "https://github.com/login" > /dev/null 2> 1> /dev/null 2> &

CHROME_PID=$!
echo "🔄 Chrome launched (PID: $CHROME_PID)"
echo ""
echo "✅ Activities to complete:"
echo "   1. Log into GitHub"
echo "   2. Go to https://github.com/copilot/"
echo "   3. Ensure you see the Copilot interface (not marketing page)"
echo ""
echo -n "📝 After you've completed the auth flow, press [Enter] to continue..."
read waiting

echo ""
echo "🔍 Checking for GitHub session cookies..."
sleep 2

node -e "
const mod = await import('chrome-cookies-secure');
const getCookies = mod.getCookiesPromised || mod.default?.getCookiesPromised;
const cookies = await getCookies('https://github.com', 'puppeteer', 'Default');

console.log('🔸 Session check:');
const required = ['user_session', 'logged_in', '__Host-user_session_same_site'];
let hasSession = false;

for (const c of cookies) {
  if (required.includes(c.name) && c.value) {
    hasSession = true;
    console.log(\`✅ \${c.name}: authenticated\`);
  }
}

if (hasSession) {
  console.log('\\n🎉 SUCCESS! GitHub authenticated session detected!');
  console.log('You can now run: pnpm tsx scripts/copilot-poc.ts \"Your prompt\"');
} else {
  console.log('\\n⚠️  No valid session. Please run the manual auth process again.');
}"

echo ""
echo "🔒 GitHub authentication setup complete!"