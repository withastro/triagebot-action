# Diagnose

Find the root cause of a reproduced bug in the triagebot-action source code.

**CRITICAL: You MUST always append to `report.md` before finishing, regardless of outcome.**

**SCOPE: Diagnosis only. Do not fix.**

## Prerequisites

- **`triageDir`** — Directory with the reproduction.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — From the reproduce step.

## Step 1: Review the Reproduction

Read `report.md`. If the bug was not reproduced, append "DIAGNOSIS SKIPPED: No reproduction" and return `confidence: null`.

## Step 2: Locate Relevant Source Files

The codebase is small. Key files:

| File | Responsibility |
|------|---------------|
| `src/router.ts` | FSM routing: event + labels → action type |
| `src/labels.ts` | Label config, categorization, swap helpers |
| `src/github.ts` | GitHub API (issues, labels, comments, PRs, branches) |
| `src/index.ts` | Entry point: reads event payload, builds context, calls router |
| `src/context.ts` | ActionContext type definition |
| `src/handlers/triage.ts` | Full triage pipeline (reproduce → diagnose → verify → fix) |
| `src/handlers/retriage.ts` | Re-triage evaluation via LLM |
| `src/handlers/verify-fix.ts` | Fix verification classification via LLM |
| `src/handlers/cleanup.ts` | Branch deletion on issue close |
| `src/handlers/comment.ts` | Triage comment generation |

## Step 3: Investigate

For logic bugs (router, labels), read the code and trace the execution path with the inputs from the reproduction.

For API bugs, check the request construction in `src/github.ts` — URL encoding, headers, token usage, response parsing.

For LLM prompt bugs, examine the prompt text in the handler files. Check whether the Valibot schema matches what the LLM is expected to return.

Add `console.log` if needed to trace execution, then revert all instrumentation before finishing.

## Step 4: Identify Root Cause

Document:

1. Which file(s) contain the bug
2. What the code does wrong
3. Why this causes the observed behavior
4. What the fix should be

## Step 5: Write Output

Append to `report.md`:

- Root cause with file paths and line numbers
- Suggested fix approach
- Confidence level (`high`, `medium`, or `low`)
