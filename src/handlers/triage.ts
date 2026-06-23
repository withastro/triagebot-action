/**
 * Triage handler. Runs the full triage pipeline:
 * reproduce → diagnose → verify → fix
 *
 * Then pushes a fix branch, publishes preview releases (via the skill),
 * posts a triage comment, and applies labels.
 */

import type { FlueSession } from '@flue/runtime';
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';
import type { ActionContext } from '../context.ts';
import {
	addLabels,
	fetchIssueDetails,
	fetchRepoLabels,
	gitPush,
	type IssueDetails,
	postComment,
	type RepoLabel,
	swapLabel,
} from '../github.ts';
import { currentTriageLabel } from '../labels.ts';
import { generateComment } from './comment.ts';

export const MAX_TRIAGE_FAILURES = 3;
const TRIAGE_FAILURE_MARKER = '<!-- triagebot:triage-failed -->';

interface TriageResult {
	completedStage: 'reproduce' | 'verify' | 'fix';
	reproducible: boolean;
	skipped: boolean;
	skippedReason: string | null;
	verdict: 'bug' | 'intended-behavior' | 'unclear' | null;
	diagnosisConfidence: 'high' | 'medium' | 'low' | null;
	fixed: boolean;
	commitMessage: string | null;
}

async function runTriagePipeline(
	session: FlueSession,
	issueNumber: number,
	issueDetails: IssueDetails,
): Promise<TriageResult> {
	const { data: reproduceResult } = await session.skill('triage', {
		args: {
			issueNumber,
			issueDetails,
			step: 'reproduce',
			instructions:
				'Run only the "reproduce" sub-skill from reproduce.md. Do not continue to diagnose, verify, or fix steps.',
		},
		result: v.object({
			reproducible: v.pipe(
				v.boolean(),
				v.description('true if the bug was successfully reproduced, false otherwise'),
			),
			skipped: v.pipe(
				v.boolean(),
				v.description(
					'true if reproduction was intentionally skipped (host-specific, unsupported version, etc.)',
				),
			),
			skippedReason: v.pipe(
				v.nullable(
					v.picklist([
						'not-actionable',
						'missing-details',
						'unsupported-version',
						'host-specific',
						'unsupported-runtime',
						'maintainer-override',
					]),
				),
				v.description('The reason reproduction was skipped, or null if not skipped'),
			),
		}),
	});

	if (reproduceResult.skipped || !reproduceResult.reproducible) {
		return {
			completedStage: 'reproduce',
			reproducible: reproduceResult.reproducible,
			skipped: reproduceResult.skipped,
			skippedReason: reproduceResult.skippedReason,
			verdict: null,
			diagnosisConfidence: null,
			fixed: false,
			commitMessage: null,
		};
	}

	const { data: diagnoseResult } = await session.skill('triage', {
		args: {
			issueDetails,
			step: 'diagnose',
			instructions:
				'Run only the "diagnose" sub-skill from diagnose.md. Do not continue to verify or fix steps.',
		},
		result: v.object({
			confidence: v.pipe(
				v.nullable(v.picklist(['high', 'medium', 'low'])),
				v.description('Diagnosis confidence level, null if not attempted'),
			),
		}),
	});

	const { data: verifyResult } = await session.skill('triage', {
		args: {
			issueDetails,
			step: 'verify',
			instructions: 'Run only the "verify" sub-skill from verify.md. Do not continue to fix step.',
		},
		result: v.object({
			verdict: v.pipe(
				v.picklist(['bug', 'intended-behavior', 'unclear']),
				v.description('Whether the reported behavior is a bug, intended behavior, or unclear'),
			),
			confidence: v.pipe(
				v.picklist(['high', 'medium', 'low']),
				v.description('Confidence level in the verdict'),
			),
		}),
	});

	if (verifyResult.verdict === 'intended-behavior') {
		return {
			completedStage: 'verify',
			reproducible: true,
			skipped: false,
			skippedReason: null,
			verdict: verifyResult.verdict,
			diagnosisConfidence: diagnoseResult.confidence,
			fixed: false,
			commitMessage: null,
		};
	}

	const { data: fixResult } = await session.skill('triage', {
		args: {
			issueDetails,
			step: 'fix',
			instructions: 'Run only the "fix" sub-skill from fix.md.',
		},
		result: v.object({
			fixed: v.pipe(
				v.boolean(),
				v.description('true if the bug was successfully fixed and verified'),
			),
			commitMessage: v.pipe(
				v.nullable(v.string()),
				v.description('A short commit message describing the fix. null if not fixed.'),
			),
		}),
	});

	return {
		completedStage: 'fix',
		reproducible: true,
		skipped: false,
		skippedReason: null,
		verdict: verifyResult.verdict,
		diagnosisConfidence: diagnoseResult.confidence,
		fixed: fixResult.fixed,
		commitMessage: fixResult.commitMessage,
	};
}

async function selectTriageLabels(
	session: FlueSession,
	{
		comment,
		priorityLabels,
		packageLabels,
	}: { comment: string; priorityLabels: RepoLabel[]; packageLabels: RepoLabel[] },
): Promise<string[]> {
	const priorityLabelNames = priorityLabels.map((l) => l.name);
	const packageLabelNames = packageLabels.map((l) => l.name);

	const { data: labelResult } = await session.prompt(
		`Label the following GitHub issue based on the triage report that was already posted.

Select labels for this issue from the lists below based on the triage report. Select exactly one priority label (the report's **Priority** section is a strong hint) and 0-3 package labels based on where the issue lives in the monorepo and how it manifests.

### Priority Labels (select exactly one)
${priorityLabels.map((l) => `- "${l.name}": ${l.description || '(no description)'}`).join('\n')}

### Package Labels (select zero or more)
${packageLabels.map((l) => `- "${l.name}": ${l.description || '(no description)'}`).join('\n')}

--- 

<triage-report format="md">
${comment}
</triage-report>
`,
		{
			result: v.object({
				priority: v.pipe(
					v.picklist(priorityLabelNames),
					v.description(
						'The priority label to apply. Must be one of the exact priority label names listed above.',
					),
				),
				packages: v.pipe(
					v.array(v.picklist(packageLabelNames)),
					v.description(
						'Package labels to apply (0-3). Each must be one of the exact package label names listed above.',
					),
				),
			}),
		},
	);

	return [labelResult.priority, ...labelResult.packages];
}

/**
 * Determine which triage label to apply based on the pipeline result.
 */
function resolveTriageLabel(result: TriageResult, ctx: ActionContext): string {
	if (result.skipped) {
		if (result.skippedReason === 'not-actionable') return ctx.labels.notActionable;
		if (result.skippedReason === 'missing-details') return ctx.labels.needsReproduction;
		return ctx.labels.skipped;
	}
	if (!result.reproducible) return ctx.labels.unableToReproduce;
	if (result.fixed) return ctx.labels.fixPending;
	return ctx.labels.unableToFix;
}

export function countTriageFailures(issueDetails: IssueDetails): number {
	return issueDetails.comments.filter((comment) => comment.body.includes(TRIAGE_FAILURE_MARKER))
		.length;
}

function currentRunUrl(ctx: ActionContext): string | null {
	const runId = process.env.GITHUB_RUN_ID;
	if (!runId) return null;
	const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
	return `${serverUrl}/${ctx.repo}/actions/runs/${runId}`;
}

function formatFailureComment(error: unknown, attempt: number, ctx: ActionContext): string {
	const runUrl = currentRunUrl(ctx);
	const message = error instanceof Error ? error.message : String(error);
	const retryMessage =
		attempt >= MAX_TRIAGE_FAILURES
			? 'This was the final automatic triage attempt. I will not retry this issue again unless a maintainer clears the failure state manually.'
			: 'I can retry if a new comment provides more information or asks me to try again.';

	return `${TRIAGE_FAILURE_MARKER}
Triage failed unexpectedly (attempt ${attempt} of ${MAX_TRIAGE_FAILURES}).

${runUrl ? `Run: ${runUrl}\n\n` : ''}${retryMessage}

Error:

\`\`\`
${message}
\`\`\``;
}

async function recordTriageFailure(
	issueNumber: number,
	ctx: ActionContext,
	error: unknown,
): Promise<void> {
	const issueDetails = await fetchIssueDetails(ctx.repo, issueNumber, ctx.readToken);
	const attempt = Math.min(countTriageFailures(issueDetails) + 1, MAX_TRIAGE_FAILURES);
	const currentLabel = currentTriageLabel(
		issueDetails.labels.map((l) => l.name),
		ctx.labels,
	);

	await postComment(
		ctx.repo,
		issueNumber,
		formatFailureComment(error, attempt, ctx),
		ctx.writeToken,
	);
	await swapLabel(ctx.repo, issueNumber, currentLabel, ctx.labels.failed, ctx.writeToken);
}

export async function handleTriage(issueNumber: number, ctx: ActionContext): Promise<void> {
	try {
		await runTriage(issueNumber, ctx);
	} catch (err) {
		try {
			await recordTriageFailure(issueNumber, ctx, err);
		} catch (failureErr) {
			console.error('Failed to record triage failure:', failureErr);
		}
		throw err;
	}
}

async function runTriage(issueNumber: number, ctx: ActionContext): Promise<void> {
	const branch = `triagebot/fix-${issueNumber}`;
	const issueDetails = await fetchIssueDetails(ctx.repo, issueNumber, ctx.readToken);
	const currentLabel = currentTriageLabel(
		issueDetails.labels.map((l) => l.name),
		ctx.labels,
	);
	if (
		currentLabel === ctx.labels.failed &&
		countTriageFailures(issueDetails) >= MAX_TRIAGE_FAILURES
	) {
		console.info(`Skipping triage for issue #${issueNumber}: maximum failed attempts reached.`);
		return;
	}

	const agent = createAgent(() => ({
		sandbox: local({
			env: {
				GH_TOKEN: ctx.readToken,
				GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
				GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
				GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
				GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT,
				GITHUB_ACTOR_ID: process.env.GITHUB_ACTOR_ID,
				GITHUB_SHA: process.env.GITHUB_SHA,
				GITHUB_REF_NAME: process.env.GITHUB_REF_NAME,
				GITHUB_OUTPUT: process.env.GITHUB_OUTPUT,
				GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
			},
		}),
		model: ctx.triageModel,
		skills: [ctx.triageSkill],
	}));

	const harness = await agent.init();
	const session = await harness.session();

	// Create the fix branch so the agent's changes don't land on main.
	// This is needed for both initial triage and retriage.
	await session.shell(`git checkout -B ${JSON.stringify(branch)}`);

	// Run the pipeline.
	const triageResult = await runTriagePipeline(session, issueNumber, issueDetails);
	let isPushed = false;

	// Push fix branch if there are changes.
	{
		const diff = await session.shell('git diff main --stat');
		if (diff.stdout.trim()) {
			const status = await session.shell('git status --porcelain');
			if (status.stdout.trim()) {
				await session.shell('git add -A');
				const defaultMessage = triageResult.fixed
					? 'fix(auto-triage): automated fix'
					: 'test(auto-triage): failing test and investigation notes';
				await session.shell(
					`git commit -m ${JSON.stringify(triageResult.commitMessage ?? defaultMessage)}`,
				);
			}
			const pushResult = await gitPush(ctx.repo, branch, ctx.writeToken, { force: true });
			console.info('push result:', pushResult);
			isPushed = pushResult.exitCode === 0;
		}
	}

	// Fetch repo labels for comment generation and label selection.
	const { priorityLabels, packageLabels } = await fetchRepoLabels(ctx.repo, ctx.readToken);

	const branchName = isPushed ? branch : null;

	// Generate the triage comment using the action's built-in comment skill.
	const comment = await generateComment(session, {
		branchName,
		priorityLabels,
		issueDetails,
		repo: ctx.repo,
	});

	await postComment(ctx.repo, issueNumber, comment, ctx.writeToken);

	// Determine and apply the new triage label.
	const newLabel = resolveTriageLabel(triageResult, ctx);
	await swapLabel(ctx.repo, issueNumber, currentLabel, newLabel, ctx.writeToken);

	// Apply priority + package labels if the issue was reproduced.
	if (triageResult.reproducible) {
		const selectedLabels = await selectTriageLabels(session, {
			comment,
			priorityLabels,
			packageLabels,
		});
		if (selectedLabels.length > 0) {
			await addLabels(ctx.repo, issueNumber, selectedLabels, ctx.writeToken);
		}
	}
}
