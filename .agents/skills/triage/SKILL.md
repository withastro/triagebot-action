---
name: triage
description: Triage a bug report against the triagebot-action codebase. Reproduces the bug, diagnoses the root cause, verifies whether the behavior is intentional, and attempts a fix.
---

# Triage

Triage a bug report end-to-end: reproduce the bug, diagnose the root cause, verify whether the behavior is intentional, and attempt a fix.

## General Rules

**Do not get stuck on infrastructure problems.** Bail out after 2 attempts and write your report with the data you already have.

This is a GitHub Action project written in TypeScript. The codebase is small — the important files are in `src/` and `test/`. There are no dev servers or browsers involved; bugs will be in the routing logic, GitHub API interactions, label management, or LLM prompt handling.

## Input

You need either:

- `issueTitle` and `issueBody` provided in args, OR
- A GitHub issue number or URL (use `gh issue view` to fetch details)

If a `triageDir` is provided in args, use that as the working directory. Otherwise, default to `triage/gh-<issue_number>`.

## Step 1: Reproduce

Read and follow [reproduce.md](reproduce.md). Use a subagent for this step to isolate context.

After completing reproduction, check the result:

- If the issue was **skipped** — skip to Output.
- If the issue was **not reproducible** — skip to Output.
- If the issue was **reproduced** — continue to Step 2.

## Step 2: Diagnose

Read and follow [diagnose.md](diagnose.md). Use a subagent for this step to isolate context.

After completing diagnosis:

- If confidence is **low** — skip to Output.
- If confidence is **medium** or **high** — continue to Step 3.

## Step 3: Verify

Read and follow [verify.md](verify.md). Use a subagent for this step to isolate context.

After completing verification:

- If the verdict is **intended-behavior** — skip to Output.
- If the verdict is **bug** or **unclear** — continue to Step 4.

## Step 4: Fix

Read and follow [fix.md](fix.md). Use a subagent for this step to isolate context.

Whether the fix succeeds or fails, continue to Output.

## Output

Return your structured results so the orchestrator can post a comment and manage labels.
