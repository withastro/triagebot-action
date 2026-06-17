# Diagnose

Find the root cause of a reproduced bug in the project's source code.

**CRITICAL: You MUST always read `report.md` and append to `report.md` before finishing, regardless of outcome. Even if you cannot identify the root cause — always update `report.md` with your findings.**

**SCOPE: Your job is diagnosis only. Do NOT go further (no fixing). Do not spawn tasks/sub-agents.**

## Prerequisites

- **`triageDir`** — Directory containing the reproduction project.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — File in `triageDir` from the reproduce step.

## Overview

1. Review the reproduction and error details from `report.md`
2. Locate relevant source files
3. Add instrumentation to understand the code path
4. Identify the root cause
5. Append diagnosis findings to `report.md`

## Step 1: Review the Reproduction

Read `report.md` from the `triageDir` directory.

**Skip if not reproduced:** If `report.md` shows the bug was NOT reproduced or was skipped, append "DIAGNOSIS SKIPPED: No reproduction" and return `confidence: null`.

Re-run the reproduction if needed to see the error firsthand.

## Step 2: Locate Relevant Source Files

<!-- CUSTOMIZE: Describe where your project's source code lives -->

Using error messages, stack traces, and reproduction details, identify the source files likely involved. Look in:

- `src/` — core source code
- `lib/` — library code
- `packages/` — monorepo packages (if applicable)

## Step 3: Investigate with Instrumentation

Add `console.log` statements to understand the code path:

```typescript
console.log('[DEBUG] Processing:', data);
```

After adding logs:

<!-- CUSTOMIZE: Use your project's build command -->

1. Rebuild the affected code
2. Re-run the reproduction
3. Observe the debug output

Iterate until you understand:
- What code path is executing
- What data is being passed
- Where the logic diverges from expected behavior

**Once done, revert all instrumentation** before moving on. Use `git checkout -- <file>` to remove debug logs. They must not leak into downstream steps.

## Step 4: Identify Root Cause

Document:

1. **Which file(s)** contain the bug
2. **What the code does wrong** — the specific logic error
3. **Why this causes the observed behavior**
4. **What the fix should be** — high-level approach

Consider:
- Is this a regression from a recent change?
- Does this affect other similar use cases?
- Are there edge cases to consider?

**Tone calibration:** Describe the root cause factually, not dramatically. Avoid overstating impact ("critical flaw", "fundamentally broken") unless evidence supports it.

## Step 5: Write Output

Append diagnosis findings to `report.md`. Include:

- Root cause explanation (which files, what logic is wrong, why)
- Affected file paths with line numbers
- Suggested fix approach
- Confidence level (`high`, `medium`, or `low`) and any caveats
