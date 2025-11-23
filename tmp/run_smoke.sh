#!/bin/bash
export ORACLE_NO_DETACH=1
export CHROME_HEADLESS=1
export CHROME_PATH=/usr/bin/google-chrome
LOG_FILE="/home/graham/workspace/experiments/oracle/tmp/smoke_debug.log"

echo "Starting smoke test at $(date)" > "$LOG_FILE"
echo "Current directory: $(pwd)" >> "$LOG_FILE"
ls -l node_modules/.bin/tsx >> "$LOG_FILE" 2>&1

./node_modules/.bin/tsx scripts/copilot-code-review.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "Finished smoke test with exit code $EXIT_CODE at $(date)" >> "$LOG_FILE"
exit $EXIT_CODE
