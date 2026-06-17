# Reproduce

Reproduce a GitHub issue to determine if a bug is valid and reproducible.

**CRITICAL: You MUST always write `report.md` to the triage directory before finishing, regardless of outcome.**

**SCOPE: Reproduction only. Do not diagnose or fix.**

## Prerequisites

- **`triageDir`** — Working directory for the triage (default: `triage/gh-<issue_number>`).
- **`issueDetails`** — The GitHub API issue details payload.

## Step 1: Confirm Bug Details

Read the issue carefully:

- Bug description and expected vs actual behavior
- Any reproduction steps or code snippets
- Environment details (Node version, OS)

## Step 2: Check for Early Exit Conditions

### Not Actionable (`not-actionable`)

Skip if not a bug report (feature requests, questions, discussions).

### Missing Details (`missing-details`)

Skip if missing a reproduction or expected behavior description.

### Maintainer Override (`maintainer-override`)

Skip if a maintainer (`authorAssociation` of `MEMBER`, `COLLABORATOR`, or `OWNER`) has said not to auto-triage.

## Step 3: Set Up Reproduction

This project is a GitHub Action written in TypeScript. Bugs typically manifest as:

- **Incorrect routing** — the FSM router picks the wrong handler for an event
- **Wrong label transitions** — labels aren't swapped correctly
- **GitHub API failures** — incorrect API calls or missing error handling
- **LLM prompt issues** — classification returns wrong results
- **Build/bundle problems** — the esbuild output doesn't work correctly

To reproduce, work in the `triageDir` directory:

1. The repo is already checked out (you're running inside it)
2. Ensure deps are installed: `pnpm install`
3. Build the project: `pnpm run build`

For routing/label bugs, write a small script in the triage directory that imports the relevant module and exercises the reported scenario:

```typescript
// triage/gh-123/test-repro.ts
import { route } from '../../src/router.ts';
import type { LabelConfig } from '../../src/labels.ts';

// Set up the scenario from the issue...
const labels: LabelConfig = { /* ... */ };
const result = route({ /* event matching the issue */ }, labels);
console.log('Result:', result);
```

For GitHub API issues, check the relevant function in `src/github.ts` against the reported behavior.

For LLM prompt issues, these are harder to reproduce deterministically. Document the prompt and expected vs actual classification.

## Step 4: Attempt Reproduction

Run the reproduction:

```bash
node triage/gh-<N>/test-repro.ts
```

Or run the existing tests to see if they catch the issue:

```bash
pnpm test
```

1. **Trigger the bug.** Confirm the reported behavior occurs.
2. **Verify the baseline.** Confirm correct behavior for non-buggy inputs.
3. **Document what you observe.**

## Step 5: Write Output

Write `report.md` to the triage directory. Include:

- Original issue details
- Steps attempted and results
- Error messages and output
- Whether reproduced, not reproduced, or skipped (and why)
