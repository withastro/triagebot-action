import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getInput } from '../src/input.ts';

const envNames = ['INPUT_READ-TOKEN', 'INPUT_READ_TOKEN'];

afterEach(() => {
	for (const envName of envNames) {
		delete process.env[envName];
	}
});

describe('getInput', () => {
	it('reads GitHub action inputs with hyphenated names', () => {
		process.env['INPUT_READ-TOKEN'] = ' token-value ';

		assert.equal(getInput('read-token'), 'token-value');
	});

	it('keeps the previous underscore lookup as a fallback', () => {
		process.env.INPUT_READ_TOKEN = 'legacy-token';

		assert.equal(getInput('read-token'), 'legacy-token');
	});
});
