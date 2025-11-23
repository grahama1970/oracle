<!--
  COPILOT CODE REVIEW TEMPLATE
  -----------------------------
  This file is meant to be edited by a project agent (human or codex)
  before sending it to Copilot via Oracle. It follows the same structure
  as COPILOT_REVIEW_REQUEST_EXAMPLE.md but with placeholders instead of
  a concrete repo.

  Usage pattern (simplest form):

    1. Fill in the sections below (repo, branch, summary, objectives,
       constraints, acceptance criteria, test plan).
    2. Optionally paste a short diff summary or list of touched files.
    3. Run the Oracle browser engine against Copilot, passing this file
       as the primary prompt body.
-->

# <Short title for this review request>

## Repository and branch

- **Repo:** `<org>/<repo>`
- **Branch:** `<branch-name>`
- **Paths of interest:**
  - `path/to/file1.ext`
  - `path/to/file2.ext`

## Summary

Briefly describe:

1. What changed or is about to change.
2. Why the change is being made.
3. Any known bugs, regressions, or risks.

Copilot’s job is to:

- Validate the proposed approach (objectives, constraints, test plan).
- Answer the clarifying questions below.
- Propose any improvements as unified diffs that respect the constraints.

## Objectives

Describe the concrete goals for this review (behavior fixes, refactors,
performance improvements, logging, etc.). Split into subsections if it
helps (e.g., “1. Logging”, “2. Error handling”, “3. API surface”).

## Constraints for the patch

- **Output format:** Unified diff only, inline inside a single fenced
  code block (```diff).
- Include a one-line commit subject on the first line of the patch.
- Hunk headers must be numeric only (`@@ -old,+new @@`); no symbolic headers.
- Patch must apply cleanly on the specified branch.
- No destructive defaults; keep behavior unchanged unless explicitly required.
- No extra commentary, hosted links, or PR creation in the output.

Adapt or extend this list as needed for each repo.

## Acceptance criteria

Describe what must be true for this change to be considered successful.
Include:

- Commands to run (e.g., tests, linters, scripts).
- Expected behaviors or outputs.
- Any invariants that must remain true.

## Test plan

Spell out a concrete manual or automated test plan, including:

1. How to reproduce the original issue (if applicable).
2. How to verify the fix works.
3. Any regression checks that should be run.

## Implementation notes (optional)

Include any constraints Copilot should respect while editing (patterns
to keep, APIs to avoid, logging style, etc.).

## Known touch points (optional)

- `path/to/important/file1.ext`
- `path/to/important/file2.ext`

## Clarifying questions

*Answer inline here or authorize assumptions:*

1. Question about the scope or limits of the change.
2. Question about preferred abstractions or patterns.
3. Question about performance / reliability tradeoffs.

## Deliverable

Reply with:

- A single fenced code block containing a unified diff that meets the
  constraints above (you may include multiple file hunks inside the same
  patch), and
- Answers to the clarifying questions above, written outside of the diff
  block so they are easy to review.

