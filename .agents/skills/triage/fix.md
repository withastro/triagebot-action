# Fix

Develop and verify a fix for a diagnosed bug in triagebot-action.

**CRITICAL: You MUST always append to `report.md` before finishing.**

**SCOPE: Do not spawn tasks/sub-agents.**

## Prerequisites

- **`triageDir`** — Directory with the reproduction.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — From previous steps.

## Step 1: Review the Diagnosis

Read `report.md` for the root cause and suggested approach.

**Skip if not reproduced:** Append "FIX SKIPPED: Not reproduced" and return `fixed: false`.

**Low-confidence path:** If diagnosis confidence is `low`, do NOT attempt a fix. Instead:

1. Identify likely areas of the codebase
2. Write a failing test if possible
3. Add `// TRIAGE:` comments near relevant code
4. Return `fixed: false`

**High-confidence path:** Proceed with implementing a fix.

## Step 2: Implement the Fix

Make changes in `src/`. Keep it minimal:

- Only change what's necessary
- Don't refactor unrelated code
- Don't add new features

Key locations:

- `src/router.ts` — FSM routing logic
- `src/labels.ts` — label management
- `src/github.ts` — GitHub API calls
- `src/handlers/*.ts` — handler logic and LLM prompts

## Step 3: Rebuild and Verify

```bash
pnpm run build
```

Fix any TypeScript errors. Then verify by running the reproduction script or the test suite.

## Step 4: Write a Test

Add a test to `test/router.test.ts` or `test/labels.test.ts` (for logic bugs) or create a new test file if needed.

Tests use Node's built-in test runner:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
```

Run in isolation:

```bash
node --test test/your-test.test.ts
```

## Step 5: Check for Regressions

```bash
pnpm test
```

All 27+ existing tests should still pass.

## Step 6: Generate Diff and Write Output

```bash
git diff src/ test/
```

Append to `report.md`:

- What was changed and why
- The full git diff
- Whether the fix was successful
- Test details
- Verification results

## Step 7: Clean Up

1. Revert debug code and temporary files
2. Confirm only fix files remain with `git status`
3. DO NOT commit — the orchestrator handles that
