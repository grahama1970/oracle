#!/bin/bash

# Detect GUI environment capabilities and suggest best auth approach

echo "🔍 Detecting GUI Environment for GitHub Copilot Authentication"
echo "============================================================"
echo

# Check if we're in a desktop environment
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    echo "✅ X11/Wayland session detected"
    desktop_available=true
else
    echo "❌ No GUI session detected (DISPLAY not set)"
    desktop_available=false
fi

# Check for VNC
if command -v vncserver &> /dev/null; then
    echo "✅ VNC server is installed"
    vnc_available=true
    # Check if VNC is running
    if pgrep -x "Xvnc" > /dev/null; then
        echo "   VNC server is currently running"
    fi
else
    echo "⚠️  VNC server not installed (can be installed)"
    vnc_available=false
fi

# Check for browser
if command -v google-chrome &> /dev/null || command -v chromium-browser &> /dev/null || command -v firefox &> /dev/null; then
    echo "✅ Browser installed (Chrome/Chromium/Firefox available)"
    browser_available=true
else
    echo "❌ No browser detected"
    browser_available=false
fi

# Check for SSH connection
if [ -n "$SSH_CONNECTION" ]; then
    echo "✅ SSH connection detected"
    ssh_connection=true
else
    echo "ℹ️  Local direct access"
    ssh_connection=false
fi

echo
echo "📋 Authentication Approach Recommendation"
echo "========================================="

if [ "$desktop_available" = true ] && [ "$browser_available" = true ]; then
    echo "🎯 RECOMMENDED: Direct GUI Authentication"
    echo "   Run: /usr/bin/google-chrome --user-data-dir=\"$HOME/.oracle/chrome-profile\" https://github.com/login"
    echo "   Complete login manually, then close browser."
    echo
elif [ "$vnc_available" = true ] && [ "$browser_available" = true ]; then
    echo "🎯 RECOMMENDED: VNC Authentication"
    echo "   Install VNC viewer locally, then run:"
    echo "   vncserver -geometry 1920x1080 :1"
    echo "   ssh -L 5901:localhost:5901 $(whoami)@$(hostname)"
    echo "   Connect VNC viewer to localhost:5901"
    echo
elif [ "$browser_available" = false ]; then
    echo "❌ CRITICAL: Install browser first"
    echo "   sudo apt-get install -y firefox"
    echo
else
    echo "📦 Profile Copy Method (Last Resort)"
    echo "   You'll need to authenticate on another machine"
    echo "   and copy the profile directory here"
    echo
fi

echo "📊 Environment Summary"
echo "======================="
echo "GUI Available: $([ "$desktop_available" = true ] && echo ✅ || echo ❌)"
echo "VNC Available: $([ "$vnc_available" = true ] && echo ✅ || echo ⚠️ (can install))"
echo "Browser Available: $([ "$browser_available" = true ] && echo ✅ || echo ❌)"
echo "SSH Connection: $([ "$ssh_connection" = true ] && echo ✅ || echo ❌)"
echo
echo "Next Steps:"
if [ "$desktop_available" = true ] || [ "$vnc_available" = true ]; then
    echo "1. Follow the manual authentication guide"
    echo "   less docs/manual_auth_guidance.md"
    echo "2. Complete GitHub login with 2FA"
    echo "3. Validate with: xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts"
else
    echo "1. Install a GUI environment (VNC recommended)"
    echo "2. Or use the profile copy method if GUI is impossible"
fi
echo
echo "The authentication file explains detailed instructions for each scenario."}{
  "ValidationOptions": {
    "profileDir": "string",
    "headless": "boolean",
    "timeout": "number",
    "quick": "boolean"
  },
  "checkUrlExists": {
    "param": "url: string"
  },
  "generateTotpCode": {
    "param": "secret: string"
  },
  "handle2FA": {
    "param": "page: Page, totpSecret?: string"
  },
  "validateAuth": {
    "param": "page: Page, options?: { skipLoginCheck?: boolean }"
  },
  "authenticateWithPlaywright": {
    "param": "options: AuthOptions"
  }
}