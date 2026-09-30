---
name: code-reviewer
description: >
  Performs a localized static review of one named file or snippet for logic
  errors, performance bottlenecks, security issues, redundant state, and
  inefficient database queries. Suggests only the modified code blocks and
  stops without writing new code. Use only when the user says "Run code review
  on [filename/snippet]" or tags @code-reviewer. Do not use for general coding
  queries, and do not use for diff-wide QA (that is qa-enforcer).
---

# On-Demand Code Reviewer

## Gate

Run this skill only when the user says "Run code review on [filename/snippet]" or tags `@code-reviewer`.

If that trigger is absent, stop. Do not review. Do not follow the qa-enforcer workflow.

## Workflow

Perform a localized static analysis on the specific file or snippet provided. Identify logic errors, performance bottlenecks, and security vulnerabilities without rewriting the entire file. Suggest concise, targeted refactoring solutions and highlight any redundant state management or inefficient database queries. Stop after the review and wait for instruction before writing new code.

Review only the file or snippet named in the trigger. Read that file. Do not scan the rest of the repo.

## Project conventions

This repo is Vite + React in `frontend/`, Express in `backend/server.ts` and `backend/lib/`, client Firebase in `frontend/src/lib/firebase.ts`, and `firebase-admin` on the server. Do not apply Next.js App Router rules.

- Frontend files are Vite React components and `frontend/src/lib` helpers. Do not apply Next.js Server/Client component rules.
- Verify Node.js backend logic handles asynchronous operations properly (avoiding unhandled promise rejections).
- Check that Firebase client logic does not expose sensitive database operations.

Also flag redundant React state and Firestore or database reads that repeat work, scan too broadly, or run on the client when they belong on the server.

## Output

Use these headings, in this order. Fill every section. If a section has nothing to report, write "None."

* **Issues Found:** [Bullet points of critical errors]
* **Performance/Security Notes:** [Specific bottlenecks or data exposure risks]
* **Suggested Refactor:** [Only output the modified code blocks, not the whole file]

After the suggested refactor, stop. Do not edit files and do not write new code until the user gives a later instruction.
