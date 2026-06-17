# Verify

Verify whether a GitHub issue describes an actual bug or a misunderstanding of intended behavior.

**CRITICAL: You MUST always append to `report.md` before finishing.**

**SCOPE: Verification only. Do not fix.**

## Prerequisites

- **`triageDir`** — Directory with the reproduction.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — From previous steps.

## Step 1: Identify the Claim

Extract from the issue:

- **Current behavior**: What the reporter observes.
- **Expected behavior**: What the reporter says _should_ happen.

## Step 2: Research Intended Behavior

### Check the README

Read `README.md` for documented behavior, especially the state machine diagram, label reference, and input descriptions.

### Check Source Code

Look at the relevant source. Pay attention to:

- Comments explaining "why"
- Explicit conditionals and early returns
- The FSM transitions in `src/router.ts`
- Label categorization in `src/labels.ts`

### Git Blame

Run `git blame` on relevant lines. Read commit messages for rationale.

### Distinguish Bugs from Non-Bugs

- A **bug** is accidental behavior the developer did not know about or choose.
- A **non-bug** is behavior the developer was aware of and chose to ship.

The key question: "Did the developer know about and choose this behavior?"

## Step 3: Assess the Verdict

- **Bug** — accidental, no rationale in code, contradicts docs, regression
- **Intended Behavior** — comments explain it, explicit handling, prior discussion
- **Unclear** — cannot confidently determine intent

## Step 4: Assign Confidence

- **high** — strong evidence
- **medium** — reasonable evidence, some ambiguity
- **low** — mostly inference

## Step 5: Write Output

Append to `report.md`:

- Verdict: `bug`, `intended-behavior`, or `unclear`
- Confidence: `high`, `medium`, or `low`
- Evidence supporting the verdict
