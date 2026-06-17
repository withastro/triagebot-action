/**
 * Eval tests for fix verification LLM classification.
 *
 * These tests require ANTHROPIC_API_KEY to be set and make real LLM calls.
 * Run separately from unit tests: `node --test test/evals/*.eval.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';

const classificationSchema = v.object({
	status: v.picklist(['confirmed', 'rejected', 'inconclusive']),
	reasoning: v.string(),
});

async function classifyComment(
	comment: string,
): Promise<'confirmed' | 'rejected' | 'inconclusive'> {
	const agent = createAgent(() => ({
		sandbox: local({ env: {} }),
		model: 'anthropic/claude-sonnet-4-6',
	}));

	const harness = await agent.init();
	const session = await harness.session();

	const { data } = await session.prompt(
		`You are reviewing a GitHub issue comment to determine if the commenter is confirming that a proposed fix works.

## Context
An automated triage bot found a fix for an issue and published a preview release.

## Comment to classify
${comment}

## Your Task
Determine if this comment is:
- **confirmed**: The fix works
- **rejected**: The fix does not work
- **inconclusive**: Neither confirmed nor rejected

Return your classification.`,
		{ result: classificationSchema },
	);

	return data.status;
}

describe('fix verification evals', { skip: !process.env.ANTHROPIC_API_KEY }, () => {
	// ---------- Positive confirmations ----------

	it('classifies "It works!" as confirmed', async () => {
		assert.equal(await classifyComment('It works!'), 'confirmed');
	});

	it('classifies "Confirmed, this fixes my issue" as confirmed', async () => {
		assert.equal(await classifyComment('Confirmed, this fixes my issue. Thank you!'), 'confirmed');
	});

	it('classifies "Tested the preview release, bug is gone" as confirmed', async () => {
		assert.equal(
			await classifyComment('Tested the preview release, the bug is gone. Works perfectly now.'),
			'confirmed',
		);
	});

	it('classifies "Thanks, that solved it" as confirmed', async () => {
		assert.equal(await classifyComment('Thanks, that solved it'), 'confirmed');
	});

	// ---------- Negative confirmations ----------

	it('classifies "Still broken" as rejected', async () => {
		assert.equal(await classifyComment('Still broken'), 'rejected');
	});

	it('classifies "Same error after installing preview" as rejected', async () => {
		assert.equal(
			await classifyComment('Same error after installing the preview release. Nothing changed.'),
			'rejected',
		);
	});

	it('classifies "The fix doesn\'t work" as rejected', async () => {
		assert.equal(
			await classifyComment("The fix doesn't work, I still get the same crash."),
			'rejected',
		);
	});

	// ---------- Inconclusive ----------

	it('classifies "How do I install this?" as inconclusive', async () => {
		assert.equal(
			await classifyComment('How do I install this? Do I run npm install with that URL?'),
			'inconclusive',
		);
	});

	it('classifies "Thanks, I\'ll try it later" as inconclusive', async () => {
		assert.equal(
			await classifyComment("Thanks, I'll try it later when I have time."),
			'inconclusive',
		);
	});

	it('classifies unrelated discussion as inconclusive', async () => {
		assert.equal(
			await classifyComment('By the way, is there a way to also configure this for SSR mode?'),
			'inconclusive',
		);
	});
});
