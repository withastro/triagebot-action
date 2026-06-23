import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { createSession } from '../../src/flue.ts';

describe('Flue session initialization', () => {
	it('creates a usable session for a standalone GitHub Action process', async () => {
		const agent = createAgent(() => ({
			sandbox: local({ env: {} }),
			model: false,
		}));

		const session = await createSession(agent);
		const result = await session.shell('printf ok');

		assert.equal(result.exitCode, 0);
		assert.equal(result.stdout, 'ok');
	});
});
