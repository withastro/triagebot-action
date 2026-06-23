/**
 * Eval tests for shouldRetriage LLM classification.
 *
 * These tests require ANTHROPIC_API_KEY to be set and make real LLM calls.
 * Run separately from unit tests: `node --test test/evals/*.eval.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';
import { createSession } from '../../src/flue.ts';

async function shouldRetriage(conversation: string): Promise<'yes' | 'no'> {
	const agent = createAgent(() => ({
		sandbox: local({ env: {} }),
		model: 'anthropic/claude-sonnet-4-6',
	}));

	const session = await createSession(agent);

	const { data } = await session.prompt(
		`You are reviewing a GitHub issue conversation to decide whether a triage re-run is warranted.

## Conversation
${conversation}

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

Return only "yes" or "no".`,
		{ result: v.picklist(['yes', 'no']) },
	);

	return data;
}

describe('retriage evals', { skip: !process.env.ANTHROPIC_API_KEY }, () => {
	// ---------- Should retriage ----------

	it('retriages when reporter provides a reproduction URL', async () => {
		const conversation = `**@bot:**
I was unable to reproduce this issue. Could you provide more details?

---

**@reporter:**
Sorry, here's a reproduction: https://stackblitz.com/edit/my-repro-abc123
This shows the exact issue when you navigate to /about.`;

		assert.equal(await shouldRetriage(conversation), 'yes');
	});

	it('retriages when reporter provides corrected steps', async () => {
		const conversation = `**@bot:**
I tried to reproduce but the build succeeded without errors.

---

**@reporter:**
You need to add \`output: "server"\` to the config. The bug only happens in SSR mode. Here are the updated steps:
1. Set output to server
2. Add a middleware that reads cookies
3. Run astro build`;

		assert.equal(await shouldRetriage(conversation), 'yes');
	});

	it('retriages when someone explicitly asks to retry', async () => {
		const conversation = `**@bot:**
Automated triage could not reproduce this issue.

---

**@maintainer:**
@bot please retry triage, I think the environment was wrong.`;

		assert.equal(await shouldRetriage(conversation), 'yes');
	});

	// ---------- Should NOT retriage ----------

	it('does not retriage for a simple thanks', async () => {
		const conversation = `**@bot:**
I found the root cause and pushed a fix.

---

**@reporter:**
Thanks for looking into this!`;

		assert.equal(await shouldRetriage(conversation), 'no');
	});

	it('does not retriage for unrelated discussion', async () => {
		const conversation = `**@bot:**
I was unable to reproduce this issue.

---

**@random-user:**
I'm having a similar issue but with a different adapter. Should I open a separate issue?`;

		assert.equal(await shouldRetriage(conversation), 'no');
	});

	it('does not retriage for acknowledgment without new info', async () => {
		const conversation = `**@bot:**
This appears to be intended behavior based on the documentation.

---

**@reporter:**
OK, I understand. I'll use the workaround mentioned in the docs.`;

		assert.equal(await shouldRetriage(conversation), 'no');
	});
});
