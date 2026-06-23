import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LabelConfig } from '../src/labels.ts';
import type { GitHubEvent } from '../src/router.ts';
import { route } from '../src/router.ts';

const labels: LabelConfig = {
	needsTriage: 'triage: needs triage',
	notActionable: 'triage: not actionable',
	needsReproduction: 'triage: needs reproduction',
	skipped: 'triage: skipped',
	unableToReproduce: 'triage: unable to reproduce',
	unableToFix: 'triage: unable to fix',
	failed: 'triage: failed',
	fixPending: 'triage: fix pending',
	fixRejected: 'triage: fix rejected',
	fixVerified: 'triage: fix verified',
	prFixVerified: 'fix verified',
};

function event(overrides: Partial<GitHubEvent>): GitHubEvent {
	return {
		action: 'opened',
		isPullRequest: false,
		issueNumber: 42,
		issueLabels: [],
		botLogins: ['github-actions[bot]', 'astrobot-houston'],
		...overrides,
	};
}

describe('router', () => {
	// ---------- Issue opened/reopened ----------

	it('routes opened issue to triage', () => {
		const result = route(event({ action: 'opened' }), labels);
		assert.deepEqual(result, { type: 'triage', issueNumber: 42 });
	});

	it('routes reopened issue to triage', () => {
		const result = route(event({ action: 'reopened' }), labels);
		assert.deepEqual(result, { type: 'triage', issueNumber: 42 });
	});

	// ---------- Issue closed ----------

	it('routes closed issue to cleanup', () => {
		const result = route(event({ action: 'closed' }), labels);
		assert.deepEqual(result, { type: 'cleanup', issueNumber: 42 });
	});

	// ---------- Pull requests ----------

	it('skips pull requests', () => {
		const result = route(event({ isPullRequest: true, action: 'opened' }), labels);
		assert.equal(result.type, 'skip');
	});

	// ---------- Comment on fix-pending → verify-fix ----------

	it('routes comment on fix-pending to verify-fix', () => {
		const result = route(
			event({
				action: 'created',
				issueLabels: ['triage: fix pending'],
				commentAuthor: 'reporter',
			}),
			labels,
		);
		assert.deepEqual(result, { type: 'verify-fix', issueNumber: 42 });
	});

	// ---------- Comment on re-triageable labels → retriage ----------

	for (const label of [
		'triage: needs triage',
		'triage: needs reproduction',
		'triage: unable to reproduce',
		'triage: unable to fix',
		'triage: failed',
		'triage: fix rejected',
	]) {
		it(`routes comment on "${label}" to retriage`, () => {
			const result = route(
				event({
					action: 'created',
					issueLabels: [label],
					commentAuthor: 'reporter',
				}),
				labels,
			);
			assert.equal(result.type, 'retriage');
			if (result.type === 'retriage') {
				assert.equal(result.currentLabel, label);
			}
		});
	}

	// ---------- Terminal labels → skip ----------

	for (const label of ['triage: fix verified', 'triage: not actionable', 'triage: skipped']) {
		it(`skips comment on terminal label "${label}"`, () => {
			const result = route(
				event({
					action: 'created',
					issueLabels: [label],
					commentAuthor: 'reporter',
				}),
				labels,
			);
			assert.equal(result.type, 'skip');
		});
	}

	// ---------- Bot comments → skip ----------

	it('skips bot comments', () => {
		const result = route(
			event({
				action: 'created',
				issueLabels: ['triage: fix pending'],
				commentAuthor: 'github-actions[bot]',
			}),
			labels,
		);
		assert.equal(result.type, 'skip');
	});

	it('skips custom bot comments', () => {
		const result = route(
			event({
				action: 'created',
				issueLabels: ['triage: fix pending'],
				commentAuthor: 'astrobot-houston',
			}),
			labels,
		);
		assert.equal(result.type, 'skip');
	});

	// ---------- No triage label → skip ----------

	it('skips comment on issue with no triage label', () => {
		const result = route(
			event({
				action: 'created',
				issueLabels: ['bug', 'pkg: astro'],
				commentAuthor: 'reporter',
			}),
			labels,
		);
		assert.equal(result.type, 'skip');
	});

	// ---------- Custom labels ----------

	it('works with custom label names', () => {
		const customLabels: LabelConfig = {
			...labels,
			fixPending: 'awaiting-confirmation',
			fixVerified: 'confirmed-fix',
		};
		const result = route(
			event({
				action: 'created',
				issueLabels: ['awaiting-confirmation'],
				commentAuthor: 'reporter',
			}),
			customLabels,
		);
		assert.deepEqual(result, { type: 'verify-fix', issueNumber: 42 });
	});

	// ---------- Unhandled events ----------

	it('skips unhandled event actions', () => {
		const result = route(event({ action: 'labeled' }), labels);
		assert.equal(result.type, 'skip');
	});
});
