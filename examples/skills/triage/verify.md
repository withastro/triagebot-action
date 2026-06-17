# Verify

Verify whether a GitHub issue describes an actual bug or a misunderstanding of intended behavior.

**CRITICAL: You MUST always read `report.md` and append to `report.md` before finishing, regardless of outcome. Even if you cannot reach a conclusion — always update `report.md`.**

**SCOPE: Your job is verification only. Do NOT go further (no fixing). Do not spawn tasks/sub-agents.**

## Prerequisites

- **`triageDir`** — Directory containing the reproduction project.
- **`issueDetails`** — The GitHub API issue details payload.
- **`report.md`** — File in `triageDir` from previous steps.

## Overview

1. Identify the claim: what does the reporter say _should_ happen?
2. Research whether the current behavior is intentional
3. Assess the verdict: bug, intended behavior, or unclear
4. Assign confidence
5. Append findings to `report.md`

## Step 1: Identify the Claim

Read the issue and extract:

- **Current behavior**: What the reporter observes.
- **Expected behavior**: What the reporter says _should_ happen.

The expected behavior is the claim you are verifying.

## Step 2: Research Intended Behavior

Investigate whether the current behavior is intentional. **Do not assume the reporter is correct.**

### Check Documentation

<!-- CUSTOMIZE: Point to your project's docs -->

Search the project docs. Does the documentation describe or imply the current behavior? Does it promise the behavior the reporter expects?

### Check Source Code for Intent Signals

Look at the relevant source code. Pay attention to:

- **Comments explaining "why"** — strong evidence of intentional design
- **Explicit conditionals and early returns** — likely intentional handling
- **Named constants and configuration** — deliberate choice

### Git Blame

Run `git blame` on relevant lines. Read the full commit message with `git show --no-patch <commit>` and review the associated PR if referenced. A commit message explaining the rationale is strong evidence.

### Search Prior Issues and PRs

```bash
gh search issues "<keywords>"
gh search prs "<keywords>"
gh issue view <number> --comments
gh pr view <number> --comments
```

If you find a closed issue where a maintainer explained why the behavior is intentional, that is strong evidence.

### Distinguish Bugs from Non-Bugs

- A **bug** is when the code does something the developer **did not know about or did not choose**. The behavior is accidental.
- A **non-bug** is when the developer **was aware and chose to ship it** — even if imperfect.

The key question: "Did the developer _know about_ and _choose_ this behavior?" If yes, it's not a bug — it's a known limitation or design choice. The reporter may have a valid enhancement request, but that's different from a bug fix.

**Common mistakes to avoid:**
- Do not treat a known limitation as a bug
- Do not treat a design trade-off as a bug just because the reporter frames it as one
- Do not conflate "imperfect" with "broken"

## Step 3: Assess the Verdict

### Bug

The developer was not aware of this behavior or did not choose it:
- No comment or rationale in the code
- Contradicts documentation
- Clearly a regression
- Falls through by accident (no guard, no comment, no test)

### Intended Behavior

The developer was aware and chose to ship it:
- Code comments explain the limitation or trade-off
- Explicit conditional handles this case by design
- Commit message or PR explains the rationale
- Prior issue closed as "not a bug"

### Unclear

Cannot confidently determine intent. Lean toward "unclear" rather than guessing.

## Step 4: Assign Confidence

- **high** — Strong evidence (explicit comments, clear docs, prior maintainer statements)
- **medium** — Reasonable evidence but some ambiguity
- **low** — Mostly inference; could go either way

## Step 5: Write Output

Append to `report.md`:

- The reporter's claim
- Your verdict: `bug`, `intended-behavior`, or `unclear`
- Confidence: `high`, `medium`, or `low`
- Evidence supporting the verdict
