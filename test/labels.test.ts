import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	allTriageLabels,
	currentTriageLabel,
	type LabelConfig,
	labelConfigFromInputs,
	retriageableLabels,
	terminalLabels,
} from '../src/labels.ts';

const config: LabelConfig = {
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

describe('labels', () => {
	describe('allTriageLabels', () => {
		it('returns 10 triage labels (excludes PR label)', () => {
			const all = allTriageLabels(config);
			assert.equal(all.length, 10);
			assert.ok(!all.includes('fix verified'));
		});
	});

	describe('retriageableLabels', () => {
		it('includes the correct labels', () => {
			const retriageable = retriageableLabels(config);
			assert.ok(retriageable.includes('triage: needs triage'));
			assert.ok(retriageable.includes('triage: needs reproduction'));
			assert.ok(retriageable.includes('triage: unable to reproduce'));
			assert.ok(retriageable.includes('triage: unable to fix'));
			assert.ok(retriageable.includes('triage: failed'));
			assert.ok(retriageable.includes('triage: fix rejected'));
		});

		it('does not include terminal or pending labels', () => {
			const retriageable = retriageableLabels(config);
			assert.ok(!retriageable.includes('triage: fix verified'));
			assert.ok(!retriageable.includes('triage: not actionable'));
			assert.ok(!retriageable.includes('triage: skipped'));
			assert.ok(!retriageable.includes('triage: fix pending'));
		});
	});

	describe('terminalLabels', () => {
		it('includes the correct labels', () => {
			const terminal = terminalLabels(config);
			assert.deepEqual(terminal.sort(), [
				'triage: fix verified',
				'triage: not actionable',
				'triage: skipped',
			]);
		});
	});

	describe('currentTriageLabel', () => {
		it('finds a triage label among issue labels', () => {
			const result = currentTriageLabel(['bug', 'triage: fix pending', 'pkg: astro'], config);
			assert.equal(result, 'triage: fix pending');
		});

		it('returns null when no triage label exists', () => {
			const result = currentTriageLabel(['bug', 'pkg: astro'], config);
			assert.equal(result, null);
		});

		it('returns the first triage label if multiple exist', () => {
			const result = currentTriageLabel(['triage: needs triage', 'triage: fix pending'], config);
			assert.equal(result, 'triage: needs triage');
		});
	});

	describe('labelConfigFromInputs', () => {
		it('uses defaults when inputs are empty', () => {
			const result = labelConfigFromInputs(() => '');
			assert.equal(result.needsTriage, 'triage: needs triage');
			assert.equal(result.failed, 'triage: failed');
			assert.equal(result.fixPending, 'triage: fix pending');
		});

		it('uses custom values from inputs', () => {
			const inputs: Record<string, string> = {
				'label-needs-triage': 'bot: pending',
				'label-fix-pending': 'bot: awaiting confirmation',
			};
			const result = labelConfigFromInputs((name) => inputs[name] ?? '');
			assert.equal(result.needsTriage, 'bot: pending');
			assert.equal(result.fixPending, 'bot: awaiting confirmation');
			// Others remain defaults.
			assert.equal(result.fixVerified, 'triage: fix verified');
		});
	});
});
