/**
 * Comment generation. Reads the triage report.md produced by the skill
 * pipeline and generates a formatted GitHub issue comment.
 *
 * This is action-owned logic — it controls the bot's output format,
 * not project-specific triage behavior.
 */

import type { FlueSession } from '@flue/runtime';
import * as v from 'valibot';
import type { IssueDetails, RepoLabel } from '../github.ts';

interface CommentArgs {
	branchName: string | null;
	priorityLabels: RepoLabel[];
	issueDetails: IssueDetails;
	repo: string;
	previewRelease?: { urls: string[] } | null;
}

const COMMENT_INSTRUCTIONS = `Generate a GitHub issue comment from triage findings.

**CRITICAL: You MUST always read report.md and produce a GitHub comment as your final output, regardless of what input files are available. Even if report.md is missing or empty, you must still produce a comment. In that case, produce a minimal comment stating that automated triage could not be completed.**

**SCOPE: Your job is comment generation only. Do NOT attempt reproduction, diagnosis, or fixing.**

## Overview

1. Read report.md from the triage directory
2. Generate a GitHub comment following the template below

## "Fix" Instructions

The **Fix** line in the template has three possible forms. Choose the one that matches the triage outcome:

1. **You created a fix:** Use "I found a potential fix for this issue." and include the suggested fix link. Avoid claiming certainty, even if the fix passes tests, frame it as a suggestion that needs human review.
2. **The issue is already fixed on main** (e.g. the user is on an older major version and the bug doesn't reproduce on current main): Use "This issue has already been fixed." and tell the user how to get the fix (e.g. upgrade).
3. **Low-confidence or no fix:** Use "I wasn't able to find a fix, but I identified some areas that may be relevant." and list the files/code paths that seem related. Frame this as a jumping-off point for a human, not a diagnosis. If a failing test was added, mention it.
4. **No leads at all:** Use "I was unable to determine the cause of this issue." This should be rare.

## "Priority" Instructions

The **Priority** line communicates the severity of this issue to maintainers. Its goal is to answer the question: **"How bad is it?"**

Select exactly ONE priority label from the priorityLabels arg. Use the label descriptions to guide your decision. Render it in bold, with the "- " prefix removed, like this: **Priority P2: Has Workaround.** Then, follow it with 1-2 sentences explaining why you chose that priority.

**Priority calibration — err on the side of lower priority:**
- Experimental/unstable features should almost never be higher than P3.
- Niche adapter/integration combos are typically P3 or lower unless they affect a core workflow.
- When in doubt, go lower. A P3 that gets bumped up by a maintainer is much better than a P5 that causes false alarm.

## Template

The comment must start with an at-a-glance summary, followed by short explanations, then the full report in a collapsible section.

\`\`\`markdown
- **Reproduced:** [Yes / No / Skipped — reason]
- **Exploration:** [Yes / No / Partial / Already fixed on main] [If branchName is non-null: — [View branch](https://github.com/{repo}/compare/{branchName}?expand=1)]
- **Unit Test:** [Yes — path/to/test.test.ts / No — reason]
- **Priority:** [See Priority Instructions above]

[2-3 sentences describing the root cause or key observations. Be specific about what's happening and where in the codebase.]

**[See Fix Instructions above.]** [1-2 sentences describing the fix in more detail.]

[If previewRelease is non-null, include the "Try this fix" section:]

### Try this fix

You can test this fix right now without waiting for a release:

[For each URL in previewRelease.urls:]
npm i <url>

If this fixes your issue, please leave a comment letting us know (e.g. "confirmed, this fixes it"). We'll then open a pull request to get this merged.

[End of conditional section.]

<details>
<summary><em>Full Triage Report</em></summary>

[Include the full contents of report.md here, formatted for readability]

</details>

_This report was made by an LLM. The analysis may be wrong, and the potential fix might not work, but is intended as a starting point for exploring the issue._
\`\`\``;

export async function generateComment(session: FlueSession, args: CommentArgs): Promise<string> {
	const { data: comment } = await session.prompt(
		`${COMMENT_INSTRUCTIONS}

## Context

- **Issue:** #${args.issueDetails.number} — ${args.issueDetails.title}
- **Branch:** ${args.branchName ?? '(none)'}
- **Repo:** ${args.repo}
- **Preview Release:** ${args.previewRelease ? args.previewRelease.urls.join(', ') : '(none)'}

### Available Priority Labels
${args.priorityLabels.map((l) => `- "${l.name}": ${l.description || '(no description)'}`).join('\n')}

Now read report.md from the triage directory and generate the comment.`,
		{
			result: v.pipe(
				v.string(),
				v.description(
					'Return only the GitHub comment body generated from the template. This returned comment must start with the bullet-point summary (- **Reproduced:** ...)',
				),
			),
		},
	);

	// The LLM sometimes returns literal "\\n" instead of actual newlines.
	return comment.replace(/\\n/g, '\n');
}
