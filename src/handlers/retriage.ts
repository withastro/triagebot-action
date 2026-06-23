/**
 * Retriage handler. When a comment arrives on an issue with a re-triageable
 * label, uses an LLM to decide whether new actionable information exists.
 * If yes, swaps the label to needs-triage and runs the full triage pipeline.
 */

import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';
import type { ActionContext } from '../context.ts';
import { createSession } from '../flue.ts';
import { fetchIssueDetails, swapLabel } from '../github.ts';
import { countTriageFailures, handleTriage, MAX_TRIAGE_FAILURES } from './triage.ts';

export async function handleRetriage(
	issueNumber: number,
	currentLabel: string,
	ctx: ActionContext,
): Promise<void> {
	const issueDetails = await fetchIssueDetails(ctx.repo, issueNumber, ctx.readToken);
	if (
		currentLabel === ctx.labels.failed &&
		countTriageFailures(issueDetails) >= MAX_TRIAGE_FAILURES
	) {
		console.info(`Retriage skipped for issue #${issueNumber}: maximum failed attempts reached.`);
		return;
	}

	const agent = createAgent(() => ({
		sandbox: local({
			env: { GH_TOKEN: ctx.readToken },
		}),
		model: ctx.verificationModel,
	}));

	const session = await createSession(agent);

	const { data: decision } = await session.prompt(
		`You are reviewing a GitHub issue conversation to decide whether a triage re-run is warranted.

## Issue
**${issueDetails.title}**

${issueDetails.body}

## Conversation
${issueDetails.comments.map((c) => `**@${c.author.login}:**\n${c.body}`).join('\n\n---\n\n')}

## Your Task
Look at the messages since the last comment from a bot account.
Consider comments from the original poster, maintainers, or other users who may have provided:
- New reproduction steps or environment details
- Corrections to a previously attempted reproduction
- Additional context about when/how the bug occurs
- Different configurations or versions to try

Then decide how to respond:
1. If there is new, actionable information that could lead to a different reproduction result
than what was already attempted, respond with "yes".
2. If someone is intentionally asking you to retry triage, respond with "yes".
3. If the new comments are just acknowledgments, thanks, unrelated discussion, or do not add
meaningful reproduction information, respond with "no".

Return only "yes" or "no" inside the ---RESULT_START--- / ---RESULT_END--- block.`,
		{ result: v.picklist(['yes', 'no']) },
	);

	if (decision === 'no') {
		console.info(`Retriage not warranted for issue #${issueNumber}`);
		return;
	}

	// New info found — swap to needs-triage and run full triage.
	console.info(`Retriaging issue #${issueNumber}`);
	await swapLabel(ctx.repo, issueNumber, currentLabel, ctx.labels.needsTriage, ctx.writeToken);
	await handleTriage(issueNumber, ctx);
}
