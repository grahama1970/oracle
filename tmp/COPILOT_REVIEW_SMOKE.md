<!--
  Minimal Copilot review request for quick smoke-testing the capture path.
  Objective: add a single log line to an existing file.
-->

## Task
- In `src/browser/actions/copilotNavigation.ts`, add a concise debug log when the Copilot response is declared stable/completed. Use the existing logger and keep the message short (e.g., "Copilot snapshot stabilized").

## Acceptance criteria
- Patch applies cleanly.
- Only one new log line is added; no functional logic changes.

## Deliverable
- A `## Patch` section with a valid unified diff that adds the log line.
- A `## Notes` section (optional) if needed.
