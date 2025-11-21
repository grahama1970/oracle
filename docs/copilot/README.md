# Copilot Browser Integration Documentation

Documentation for Oracle's GitHub Copilot browser integration.

## Getting Started (Quick Links)

**New to Oracle + Copilot?**
1. Start with [QUICKSTART.md](QUICKSTART.md) — get running in 5 minutes
2. Then read [auth.md](auth.md) — authenticate your Chrome profile
3. Run [smoke.md](smoke.md) — verify end-to-end functionality
4. Need a prompt? See [templates/](templates/) (e.g., COPILOT_REVIEW_REQUEST_EXAMPLE.md).

**Having issues?**
- See [troubleshooting.md](troubleshooting.md) for solutions

---

## Core Documentation

### Essential Reading

- **[QUICKSTART.md](QUICKSTART.md)** — One-page "run it now" guide
  - Installation
  - Quick auth validation
  - First Copilot run
  - Expected output

- **[auth.md](auth.md)** — Complete authentication guide
  - Automated auth with TOTP
  - Manual authentication (GUI, VNC, profile transfer)
  - Remote debugging setup
  - Troubleshooting auth issues

- **[browser-mode.md](browser-mode.md)** — Current browser behavior
  - Engine flags and options
  - Model selection (GPT-5 targeting)
  - Timeouts and completion signals
  - Single-turn default with opt-in follow-ups
  - Artifact locations

- **[smoke.md](smoke.md)** — End-to-end smoke test
  - 7-step validation checklist
  - Expected artifacts
  - Pass/fail criteria
  - Quick diagnostics

- **[troubleshooting.md](troubleshooting.md)** — Comprehensive troubleshooting
  - Authentication issues
  - Browser & DOM issues
  - Response completion & hangs
  - Diff extraction problems
  - Performance & resource issues

### Reference Documentation

- **[CONTRACT.md](CONTRACT.md)** — Executable specification
  - Engine and target configuration
  - Authentication requirements
  - Session management and artifacts
  - Diff automation contract
  - Git apply/commit behavior
  - Secret scanning and sanitization
  - JSON contract for project agents
  - Exit codes
  - Copilot review rounds and max-turns

- **[CONTEXT.md](CONTEXT.md)** — Current working context
  - High-level goals of this fork
  - Environment snapshot
  - Key files and scripts
  - What's implemented
  - Known blockers
  - Next steps for agents

- **[FEATURES.md](FEATURES.md)** — Feature overview
  - Browser-driven Copilot runs
  - Auth reuse (headless/headful)
  - Robust completion detection
  - Model selection safeguards
  - Single-turn default
  - Structured outputs
  - Smoke-testable workflow

- **Templates** — Prompt library
  - [templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md](templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md) — ready-to-paste review prompt

- **[INTEGRATION-PYTHON.md](INTEGRATION-PYTHON.md)** — Python integration
  - JSON result contract
  - Example integration code
  - Orchestration flow
  - Field reference

---

## Legacy Documentation

Historical docs preserved for reference. **Use the core docs above for current information.**

Located in `legacy/` subdirectory:
- Auth guides (original detailed versions)
- Solution summaries and fix writeups
- Old smoke tests
- Historical troubleshooting docs

See [LEGACY.md](LEGACY.md) for complete inventory.

**Note:** Information in legacy docs is superseded by core docs. Refer to legacy only for historical context.

---

## Documentation Organization

```
docs/copilot/
├── README.md              ← You are here
├── QUICKSTART.md          ← Start here
├── auth.md                ← Authentication (consolidated)
├── browser-mode.md        ← Current behavior
├── smoke.md               ← End-to-end test
├── troubleshooting.md     ← Troubleshooting (consolidated)
├── CONTRACT.md            ← Specification
├── CONTEXT.md             ← Working context
├── FEATURES.md            ← Feature overview
├── INTEGRATION-PYTHON.md  ← Python guide
├── LEGACY.md              ← Legacy inventory
├── templates/             ← Prompt templates (review request, etc.)
├── tests/                 ← Copilot browser tests/scripts (lean set)
├── deprecated/            ← Deprecated summaries (PROGRESS_SUMMARY, SOLUTION_README)
├── legacy/                ← Historical docs
│   ├── troubleshooting/
│   └── ...
└── (deprecated files → legacy/)
```

---

## Quick Command Reference

```bash
# Validate auth
xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless

# Test Copilot
xvfb-run -a pnpm tsx scripts/copilot-poc.ts "Hello"

# Run smoke test
ORACLE_NO_DETACH=1 xvfb-run -a pnpm tsx scripts/copilot-code-review.ts \
  docs/smoke/prompt.md --apply-mode none --model gpt-5

# Debug selectors
pnpm tsx scripts/test-copilot-selectors.ts

# Inspect live browser
pnpm tsx scripts/browser-tools.ts inspect --port <PORT>

# Send a Copilot review request using the template
oracle --engine browser --copilot --model gpt-5 \
  --prompt "$(cat docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md)"
```

---

## Maintenance Notes

**When updating docs:**
- Edit core docs directly
- Do NOT create versioned files
- Move obsolete docs to `legacy/`
- Update LEGACY.md when adding to legacy/
- Keep this README in sync

**Doc consolidation completed:** November 2025
