# Copilot Legacy Documentation

Historical documentation preserved for reference. **For current information, use the [core docs](README.md).**

## Why Legacy Docs Exist

These documents represent the evolution of Oracle's Copilot integration:
- Original auth solutions and troubleshooting approaches
- Historical fix writeups and debugging sessions
- Detailed solution summaries from various contributors
- Smoke tests and validation approaches that evolved over time

They are kept for:
- Understanding the history of specific bugs and fixes
- Reference during regressions or similar issues
- Learning from past debugging approaches
- Preserving institutional knowledge

## Current vs. Legacy

**Use these instead:**
- [auth.md](auth.md) — Consolidated authentication guide
- [troubleshooting.md](troubleshooting.md) — All troubleshooting consolidated
- [smoke.md](smoke.md) — Current smoke test
- [browser-mode.md](browser-mode.md) — Current browser behavior

**Legacy docs below are superseded by the above.**

---

## Legacy Documentation Inventory

### Authentication (legacy/)

**Original detailed guides:**
- `GITHUB_COPILOT_AUTH_COMPLETE_GUIDE.md` — Original comprehensive auth guide with detailed cookie explanations
- `AUTHENTICATION_SOLUTION_SUMMARY.md` — Kimi's complete solution summary including Ubuntu case study
- `AUTHENTICATION_UNBLOCKED.md` — Auth unblocking history and timeline
- `MANUAL_AUTH_GUIDE.md` — Original manual authentication instructions
- `MANUAL_LOGIN_FROM_TERMINAL.md` — Terminal-based auth approaches (GUI/VNC/profile copy)

**Superseded by:** [auth.md](auth.md)

### Smoke Tests & Validation (legacy/)

- `COPILOT_SMOKE_TEST.md` — Original 7-step smoke test with detailed expectations
- `SOLUTION_README.md` — Solution overview and testing notes

**Superseded by:** [smoke.md](smoke.md)

### Python Integration (legacy/)

- `INTEGRATION-PYTHON.md` — Duplicate of current version

**Current version:** [INTEGRATION-PYTHON.md](INTEGRATION-PYTHON.md) (kept in root, not legacy)

### Troubleshooting (legacy/troubleshooting/)

**Response & Completion Issues:**
- `COPILOT_RESPONSE_FIX_SUMMARY.md` — Comprehensive fix for response stabilization
  - Detailed selector chain explanations
  - Zero-char debugging additions
  - Early exit conditions
  - Before/after comparisons
  
- `COPLIOT_HANG_FIX.md` — TL;DR version of hang fix
  - Problem/root cause/fix applied
  - One-file change summary
  - Running instructions

**Browser & DOM Issues:**
- `COPILOT_BROWSER_DEBUG.md` — Remote debugging approach recommendation
  - Why cookie copying is brittle
  - Remote debugging alternative
  - Cross-platform robustness

**Authentication (old):**
- `COPILOT_AUTH_TROUBLESHOOTING.md` — Empty file (placeholder)

**Superseded by:** [troubleshooting.md](troubleshooting.md)

---

## File Locations

```
docs/copilot/
├── legacy/
│   ├── AUTHENTICATION_SOLUTION_SUMMARY.md
│   ├── AUTHENTICATION_UNBLOCKED.md
│   ├── COPILOT_SMOKE_TEST.md
│   ├── GITHUB_COPILOT_AUTH_COMPLETE_GUIDE.md
│   ├── INTEGRATION-PYTHON.md (duplicate)
│   ├── MANUAL_AUTH_GUIDE.md
│   ├── MANUAL_LOGIN_FROM_TERMINAL.md
│   ├── SOLUTION_README.md
│   └── troubleshooting/
│       ├── COPILOT_AUTH_TROUBLESHOOTING.md (empty)
│       ├── COPILOT_BROWSER_DEBUG.md
│       ├── COPILOT_RESPONSE_FIX_SUMMARY.md
│       └── COPLIOT_HANG_FIX.md
└── (deprecated stub files removed)
```

---

## When to Consult Legacy Docs

**Consult legacy docs when:**
- You encounter a similar bug to one previously fixed
- You need detailed explanation of a specific past fix (e.g., hang fix, response stabilization)
- You want to understand the evolution of authentication approach
- You're debugging regressions and want to see what was tried before

**Don't consult legacy docs for:**
- Current setup instructions → use [auth.md](auth.md)
- Current troubleshooting → use [troubleshooting.md](troubleshooting.md)
- Current smoke tests → use [smoke.md](smoke.md)
- Current behavior reference → use [browser-mode.md](browser-mode.md)

---

## Deprecated Stubs Removed

The following stub files that pointed to legacy docs have been removed:
- `post_auth_checklist.md` — content merged into [auth.md](auth.md)
- Various troubleshooting stubs — consolidated into [troubleshooting.md](troubleshooting.md)

These redirects are no longer needed since the core docs now contain all current information.

---

## Maintenance Policy

**Adding to legacy:**
1. When a doc becomes obsolete due to consolidation or replacement
2. Move file to `legacy/` or `legacy/troubleshooting/` as appropriate
3. Update this LEGACY.md inventory
4. Add "Superseded by: [new-doc.md](new-doc.md)" note to the legacy file header

**Do NOT:**
- Edit legacy docs to keep them current (edit the core docs instead)
- Create new docs in legacy/ (create in root, move to legacy when superseded)
- Delete legacy docs without consensus (preservation is the goal)

---

Last updated: November 2025

