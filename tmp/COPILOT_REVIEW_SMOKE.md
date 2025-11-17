<!--
  Copilot review smoke test — aligns with docs/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md
  Repo: grahama1970/oracle
  Branch: feat/copilot-auth-review
-->

## Context
- Repo: `grahama1970/oracle`
- Branch: `feat/copilot-auth-review`
- Goal: keep Copilot capture minimal for debugging.

## Task
- In `src/browser/actions/copilotNavigation.ts`, add a concise debug log when the Copilot response is declared stable/completed. Use the existing logger; keep the message short (e.g., "Copilot snapshot stabilized").

## Acceptance criteria
- Patch applies cleanly on the current branch.
- Exactly one new log line is added; no functional logic changes.

## Deliverable
- A `## Patch` section with a unified diff adding the log line.
- A `## Notes` section (optional) if needed.
