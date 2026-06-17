# Reproduce

Reproduce a GitHub issue to determine if a bug is valid and reproducible.

**CRITICAL: You MUST always read `report.md` and write `report.md` to the triage directory before finishing, regardless of outcome. Even if you encounter errors, cannot reproduce the bug, hit unexpected problems, or need to skip — always write `report.md`. The orchestrator and downstream skills depend on this file to determine what happened. If you finish without writing it, the entire pipeline fails silently.**

**SCOPE: Your job is reproduction only. Do NOT go further than this (no diagnosis, no fixing). Do not spawn tasks/sub-agents.**

## Prerequisites

- **`triageDir`** — Directory containing the reproduction project (e.g. `triage/issue-123`). If not passed as an arg, default to `triage/gh-<issue_number>`.
- **`issueDetails`** — The GitHub API issue details payload.

## Overview

1. Confirm the issue details
2. Check for early exit conditions
3. Set up a reproduction project
4. Attempt to reproduce the bug
5. Write `report.md` with findings

## Step 1: Confirm Bug Details

Confirm that you have `issueDetails`. Read carefully:

- The bug description and expected vs actual behavior
- Any reproduction steps provided
- Environment details (versions, OS, runtime)
- Comments that might clarify the issue

## Step 2: Check for Early Exit Conditions

Before attempting reproduction, check if this issue should be skipped.

**Comment Handling:** An early exit is only valid if no later comments in the issue invalidate it. For example, if the original reporter was on an old version but a later comment reproduces on the current version, the early exit no longer applies.

<!-- CUSTOMIZE: Add or remove early exit conditions for your project -->

### Not Actionable (`not-actionable`)

Skip if the issue is not a bug report (feature requests, suggestions, discussions).

### Missing Details (`missing-details`)

Skip if the issue is missing:
- A valid reproduction (URL, steps, or code snippet)
- A description of the expected result

### Unsupported Version (`unsupported-version`)

<!-- CUSTOMIZE: Set your supported version range -->
Skip if the bug targets an unsupported version. Only the current major version is supported.

### Host-Specific Issues (`host-specific`)

Skip if the bug can only be reproduced on a specific hosting platform and not locally.

### Runtime-Specific Issues (`unsupported-runtime`)

<!-- CUSTOMIZE: List which runtimes your CI sandbox supports -->
Skip if the bug is specific to a runtime not available in CI. Our sandbox only supports Node.js.

### Maintainer Override (`maintainer-override`)

Skip if a maintainer (check `authorAssociation` for `MEMBER`, `COLLABORATOR`, or `OWNER`) has commented that this issue should not be auto-triaged.

## Step 3: Set Up Reproduction Project

Set up the reproduction in the `triageDir` directory.

### From a GitHub URL

```bash
git clone https://github.com/<owner>/<repo>.git <triageDir>
rm -rf <triageDir>/.git
```

### From a StackBlitz URL

```bash
npx stackblitz-clone@latest <stackblitz-url> <triageDir>
```

### From Manual Steps

<!-- CUSTOMIZE: Describe how to scaffold a minimal project for your framework/tool -->

If no reproduction URL is provided, create a minimal project and apply the reporter's configuration and code changes:

```bash
# Example: scaffold from a template
cp -r templates/minimal <triageDir>
```

Then modify the project to match the reproduction steps from the issue.

### Install Dependencies

<!-- CUSTOMIZE: Use your project's package manager -->

```bash
npm install
```

## Step 4: Attempt Reproduction

<!-- CUSTOMIZE: Use your project's build/dev/test commands -->

1. **Trigger the bug.** Follow the reproduction steps and confirm the bug appears.
2. **Verify the baseline.** Remove the triggering code and confirm the project works without the bug. This guards against false positives.
3. **Document what you observe.** Record exact error messages, stack traces, which command triggers the issue, and whether it's consistent.

### Server Management Rules

- **Bail out after 2 failed server starts.** Do not loop endlessly.
- **Always stop servers before restarting.**
- **One reproduction run is enough.** Additional testing belongs in the diagnose step.
- **Prefer build commands over dev servers when possible.** Build-time reproduction avoids server lifecycle issues.

## Step 5: Write Output

Write `report.md` to the triage directory. This is NOT for humans — it's context for the next pipeline stage. Include:

- The original issue title, description, and relevant details
- Full environment details
- All steps attempted and their results
- Complete error messages and stack traces
- Observations, theories about root cause
- Whether the issue was reproduced, not reproduced, or skipped (and why)

Be thorough. More context is better.
