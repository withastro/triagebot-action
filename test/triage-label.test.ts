import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActionContext } from '../src/context.ts';
import { resolveTriageLabel, type TriageResult } from '../src/handlers/triage.ts';
import { type LabelConfig, labelConfigFromInputs } from '../src/labels.ts';

const labels: LabelConfig = labelConfigFromInputs(() => '');

// resolveTriageLabel only reads ctx.labels; the rest of the context is irrelevant here.
const ctx = { labels } as unknown as ActionContext;

function result(overrides: Partial<TriageResult>): TriageResult {
	return {
		completedStage: 'fix',
		reproducible: true,
		skipped: false,
		skippedReason: null,
		verdict: 'bug',
		diagnosisConfidence: 'high',
		fixed: false,
		commitMessage: null,
		...overrides,
	};
}

describe('resolveTriageLabel', () => {
	it('maps skipped "not-actionable" to the not-actionable label', () => {
		const label = resolveTriageLabel(
			result({ completedStage: 'reproduce', skipped: true, skippedReason: 'not-actionable' }),
			ctx,
			null,
			false,
		);
		assert.equal(label, labels.notActionable);
	});

	it('maps skipped "missing-details" to the needs-reproduction label', () => {
		const label = resolveTriageLabel(
			result({ completedStage: 'reproduce', skipped: true, skippedReason: 'missing-details' }),
			ctx,
			null,
			false,
		);
		assert.equal(label, labels.needsReproduction);
	});

	it('maps other skip reasons to the skipped label', () => {
		const label = resolveTriageLabel(
			result({ completedStage: 'reproduce', skipped: true, skippedReason: 'host-specific' }),
			ctx,
			null,
			false,
		);
		assert.equal(label, labels.skipped);
	});

	it('maps a non-reproducible result to unable-to-reproduce', () => {
		const label = resolveTriageLabel(
			result({ completedStage: 'reproduce', reproducible: false }),
			ctx,
			null,
			false,
		);
		assert.equal(label, labels.unableToReproduce);
	});

	it('maps a reproduced-but-unfixed result to unable-to-fix', () => {
		const label = resolveTriageLabel(result({ fixed: false }), ctx, null, false);
		assert.equal(label, labels.unableToFix);
	});

	// ---------- Fixed branch ----------

	it('returns fix-verified when a PR was opened directly (auto-pr-on-fix)', () => {
		const label = resolveTriageLabel(result({ fixed: true }), ctx, null, true);
		assert.equal(label, labels.fixVerified);
	});

	it('prefers fix-verified even when a preview release is also present', () => {
		const label = resolveTriageLabel(result({ fixed: true }), ctx, { urls: ['x'] }, true);
		assert.equal(label, labels.fixVerified);
	});

	it('returns fix-pending when a fix has a preview release but no PR', () => {
		const label = resolveTriageLabel(result({ fixed: true }), ctx, { urls: ['x'] }, false);
		assert.equal(label, labels.fixPending);
	});

	it('falls back to needs-triage when a fix has neither preview nor PR', () => {
		const label = resolveTriageLabel(result({ fixed: true }), ctx, null, false);
		assert.equal(label, labels.needsTriage);
	});
});
