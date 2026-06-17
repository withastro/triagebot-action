/**
 * FSM router. Determines which handler to run based on the GitHub event
 * type and the current triage label on the issue.
 */

import type { LabelConfig } from './labels.ts';
import { currentTriageLabel, retriageableLabels } from './labels.ts';

export type Action =
	| { type: 'triage'; issueNumber: number }
	| { type: 'verify-fix'; issueNumber: number }
	| { type: 'retriage'; issueNumber: number; currentLabel: string }
	| { type: 'cleanup'; issueNumber: number }
	| { type: 'skip'; reason: string };

export interface GitHubEvent {
	action: string;
	isPullRequest: boolean;
	issueNumber: number;
	issueLabels: string[];
	commentAuthor?: string;
	/** Bot usernames that should not trigger actions. */
	botLogins: string[];
}

export function route(event: GitHubEvent, labels: LabelConfig): Action {
	const { action, isPullRequest, issueNumber, issueLabels, commentAuthor, botLogins } = event;

	// Never act on pull requests.
	if (isPullRequest) {
		return { type: 'skip', reason: 'Event is on a pull request, not an issue' };
	}

	// Issue opened or reopened → run triage.
	if (action === 'opened' || action === 'reopened') {
		return { type: 'triage', issueNumber };
	}

	// Issue closed → clean up fix branch.
	if (action === 'closed') {
		return { type: 'cleanup', issueNumber };
	}

	// Comment created → route based on current label.
	if (action === 'created') {
		// Ignore bot comments to prevent self-triggering loops.
		if (commentAuthor && botLogins.includes(commentAuthor)) {
			return { type: 'skip', reason: `Comment from bot (${commentAuthor})` };
		}

		const current = currentTriageLabel(issueLabels, labels);

		// Fix pending → run fix verification.
		if (current === labels.fixPending) {
			return { type: 'verify-fix', issueNumber };
		}

		// Re-triageable label → potentially re-triage.
		const retriageable = retriageableLabels(labels);
		if (current !== null && retriageable.includes(current)) {
			return { type: 'retriage', issueNumber, currentLabel: current };
		}

		// Terminal label or no triage label → do nothing.
		return {
			type: 'skip',
			reason: current ? `Terminal label: ${current}` : 'No triage label on issue',
		};
	}

	return { type: 'skip', reason: `Unhandled event action: ${action}` };
}
