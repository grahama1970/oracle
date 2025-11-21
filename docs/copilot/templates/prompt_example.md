# Prompt to send to the Copilot agent (chat-ready)

Paste this to the agent; the agent will run Copilot Web (model GPT‑5) using the template and return with clarifying answers + a unified diff. Branch is already pushed.

**Context**
- Repo: `grahama1970/oracle`
- Branch: `feat/copilot-auth-review`
- Target: `docs/copilot/QUICKSTART.md`

**Prompt text to send**
```
Using docs/copilot/templates/COPILOT_REVIEW_REQUEST_EXAMPLE.md, review docs/copilot/QUICKSTART.md on branch feat/copilot-auth-review (repo: grahama1970/oracle).
Answer the clarifying questions from the template first, then provide a single fenced ```diff block (unified diff) with any improvements. Focus only on QUICKSTART and Copilot-support instructions.
Run the helper/CLI as needed, save artifacts to tmp/copilot-review-*.{log,json,patch|no-diff.txt}, apply only diffs you agree with, and report back what you applied or declined.
Model: GPT-5.
```
