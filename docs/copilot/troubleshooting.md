# Copilot Troubleshooting (Index)

Quick pointers to the detailed guides:

- Authentication issues: `troubleshooting/COPILOT_AUTH_TROUBLESHOOTING.md`
- Browser/DOM selectors & model picker quirks: `troubleshooting/COPILOT_BROWSER_DEBUG.md`
- Response hangs / completion detection / diff extraction: `troubleshooting/COPILOT_RESPONSE_FIX_SUMMARY.md` and `troubleshooting/COPLIOT_HANG_FIX.md`

General tips:
- Re-validate auth: `xvfb-run -a pnpm tsx tmp/validate-auth-enhanced.ts --quick --headless`
- Force headful run to observe model chip and spinner state if automation stalls.
- Always target GPT-5 in the picker; log chip text if mismatched.
