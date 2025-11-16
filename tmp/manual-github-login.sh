#!/bin/bash

# Manual GitHub login script
# Launches Chrome in visible mode to allow manual GitHub login

echo "Opening Chrome in non-headless mode to allow manual GitHub login..."
echo "Please:"
echo "1. Navigate to https://github.com/login"
echo "2. Log in with your GitHub credentials"
echo "3. Navigate to https://github.com/copilot/"
echo "4. Wait for the Copilot interface to load"
echo "5. Close the browser window when done"
echo ""
read -p "Press [Enter] to launch Chrome..."

/usr/bin/google-chrome \
  --user-data-dir="$HOME/.config/google-chrome/Default" \
  --no-first-run \
  --no-default-browser-check \
  --password-store=basic \
  "https://github.com/login"