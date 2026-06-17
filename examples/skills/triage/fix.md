# Fix

Develop and verify a fix for a diagnosed bug.

**CRITICAL: You MUST always read `report.md` and append to `report.md` before finishing, regardless of outcome. Even if the fix fails — always update `report.md`.**

**SCOPE: Do not spawn tasks/sub-agents.**

## Prerequisites

- **`triageDir`** — Directory containing the reproduction project.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — File in `triageDir` from previous steps.

## Overview

1. Review the diagnosis from `report.md`
2. Implement a minimal fix
3. Rebuild and verify
4. Write a test
5. Check for regressions
6. Generate git diff
7. Append fix details to `report.md`
8. Clean up

## Step 1: Review the Diagnosis

Read `report.md` to understand the root cause, affected files, and suggested approach.

**Skip if prerequisites unmet:** If the bug was not reproduced or was skipped, append "FIX SKIPPED: Not reproduced" and return `fixed: false`.

**Low-confidence path:** If diagnosis confidence is `low` or no clear root cause was found, do NOT attempt a code fix. Instead:

1. Identify the most likely area(s) of the codebase related to the issue
2. If possible, write a failing test that demonstrates the expected behavior
3. Add brief inline comments (prefixed `// TRIAGE:`) near relevant lines to help the implementor orient
4. Append findings to `report.md` and return `fixed: false`

**High-confidence path:** If confidence is `medium` or `high`, proceed with implementing a fix.

## Step 2: Implement the Fix

<!-- CUSTOMIZE: Describe where source files live in your project -->

Make changes in your project's source files. Follow these principles:

**Keep it minimal:**
- Only change what's necessary to fix the bug
- Don't refactor unrelated code
- Don't add new features

**Consider edge cases:**
- Will this break other use cases?
- What happens with unusual input?
- Are there null/undefined checks needed?

## Step 3: Rebuild and Verify

<!-- CUSTOMIZE: Use your project's build and test commands -->

After making changes:

1. Rebuild the affected code
2. Re-run the reproduction to confirm the fix works
3. Watch for build/type errors and fix them

## Step 4: Write a Test

Write a test that covers the bug. It should fail without the fix and pass with it.

<!-- CUSTOMIZE: Describe your test conventions, directory structure, and test runner -->

```bash
# Example: run the test in isolation
npm test -- --filter "your-test-name"
```

If you cannot write a meaningful test (e.g. the bug requires infrastructure not available in tests), document why in `report.md`.

## Step 5: Check for Regressions

<!-- CUSTOMIZE: Describe how to run your test suite -->

Run the relevant test suite to ensure you didn't break anything:

```bash
npm test
```

If you find regressions, refine the fix.

## Step 6: Generate Git Diff

```bash
git diff
```

This captures all your changes for the report.

## Step 7: Write Output

Append fix details to `report.md`:

- What was changed and why
- The full git diff
- Whether the fix was successful
- Verification results
- Test details (what was added, where, what it verifies)
- Alternative approaches considered

## Step 8: Clean Up

1. Run `git status` and review all changed files
2. Revert changes that are NOT part of the fix:
   - Debug code and `console.log` statements
   - Temporary files from diagnosis/reproduction
   - Build artifacts
3. Use `git checkout -- <file>` to discard unwanted changes
4. DO NOT commit or push — the orchestrator handles that
