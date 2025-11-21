#!/bin/bash
# Simple wrapper for the Copilot code-review script with the latest fixes

echo "=== Copilot Code Review (With Response Stabilization Fix) ==="
echo ""

# Get the branch and recent commits for context
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"
echo "Recent commits:"
git log --oneline -3
echo ""

# Default arguments
TEMPLATE="${1:-docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md}"
MAX_TURNS="${2:-3}"
APPLY_MODE="${3:-none}"

echo "Configuration:"
echo "  Template: $TEMPLATE"
echo "  Max turns: $MAX_TURNS"
echo "  Apply mode: $APPLY_MODE"
echo ""

echo "Running Copilot code review with stabilized response detection..."
echo ""

pnpm tsx scripts/copilot-code-review.ts \
  "$TEMPLATE" \
  --max-turns "$MAX_TURNS" \
  --apply-mode "$APPLY_MODE" \
  "$@"

# Report what happened
echo ""
echo "=== Review Complete ==="
echo ""

# Check for outputs
if ls tmp/*copilot-review-turn-*.patch 2>/dev/null; then
  echo "✅ Success! Patches generated:"
  ls -la tmp/*copilot-review-turn-*.patch
  echo ""
  # Show a preview of patches
  for patch in tmp/*copilot-review-turn-*.patch; do
    echo "=== Preview of $(basename "$patch") ==="
    head -20 "$patch"
    echo ""
  done
elif [ -f "tmp/copilot-review-no-diff.txt" ]; then
  echo "ℹ️ Copilot responded but no valid diff was found."
  echo "Response saved to: tmp/copilot-review-no-diff.txt"
  echo ""
  # Show preview
  echo "=== Response Preview (first 50 lines) ==="
  tail -50 "tmp/copilot-review-no-diff.txt" | head -50
else
  echo "⚠️ No output files found. The script may have timed out or errored."
  echo "Check the logs for details."
fi

echo ""
echo "=== Debugging Information ==="
echo ""
echo "To debug selector issues, run the diagnostic tool:"
echo "  ./scripts/test-copilot-selectors.ts"
echo ""
echo "To monitor logs during a run:"
echo "  tail -f tmp/copilot-review-latest.log | grep -E '(debug|error|complete)'"
echo ""
echo "Recent log entries:"
tail -100 tmp/copilot-review-latest.log 2>/dev/null | tail -20 || echo "No log file found"

exit 0
