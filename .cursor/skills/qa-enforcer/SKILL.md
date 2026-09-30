---
name: qa-enforcer
description: >
  Checks only the active diff and the workflows those edits touch for logic
  bugs, broken type contracts, missing error handlers, and side effects.
  Use only when the user says "Run diff QA check" or "Verify these changes
  won't break touched workflows", or tags @qa-enforcer. Do not use for a
  single-file static review (that is code-reviewer) or for general coding.
---

# Diff-Targeted QA Enforcer

## Gate

Run this skill only when the user says "Run diff QA check", says "Verify these changes won't break touched workflows", or tags `@qa-enforcer`.

If that trigger is absent, stop. Do not inspect the diff. Do not follow the code-reviewer workflow.

## Workflow

Analyze **only** the code modified in the active prompt and the immediate workflows directly touched by those changes. Inspect the active diff or updated functions for logic bugs, broken type contracts, missing error handlers, or unexpected side effects on directly connected calls. Simulate edge cases strictly for the modified parameters, props, or state mutations to ensure the updated implementation does not break the affected flow.

Read `git diff` for uncommitted edits, or the code the user pasted in the prompt when there is no diff. Then read only the functions that call the edited symbols. Do not index the rest of the codebase.

## Project conventions

- Limit scope strictly to modified files/functions and their immediate callers; do not perform full-codebase indexing or deep scans outside the diff context.
- Ensure modified Node.js endpoints retain fallback error boundaries and proper HTTP responses.
- Verify updated Vite React components and Firebase queries maintain type safety and backward compatibility with existing component props or API callers.

Express routes live in `backend/server.ts`. Client Firebase lives in `frontend/src/lib/firebase.ts`. Privileged database work belongs in `firebase-admin` on the server. This repo does not use Next.js.

## Output

Use these headings, in this order. Fill every section.

* **Scope of Changes:** [List only the modified files and functions]
* **Changed Workflows Verified:** [Describe execution paths for the modified logic]
* **Regression & Edge Case Risk:** [List potential edge cases in the modified code (e.g., empty responses, undefined props, missing catch blocks)]
* **Final Verdict:** [PASS / FAIL with required fixes]

PASS means the modified paths keep their types, error handling, and caller contracts. FAIL means name the required fixes and stop. Do not edit files unless the user asks for the fixes afterward.
