import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

let tempDir: string | null = null;

afterEach(() => {
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

describe('action entrypoint', () => {
	it('runs the built action with GitHub-style hyphenated input env vars', () => {
		tempDir = mkdtempSync(join(tmpdir(), 'triagebot-action-'));
		const eventPath = join(tempDir, 'event.json');
		writeFileSync(eventPath, JSON.stringify({ action: 'opened' }));

		const result = spawnSync(process.execPath, ['dist/index.mjs'], {
			cwd: process.cwd(),
			env: {
				...process.env,
				GITHUB_EVENT_PATH: eventPath,
				GITHUB_REPOSITORY: 'withastro/astro',
				'INPUT_READ-TOKEN': 'read-token',
				'INPUT_WRITE-TOKEN': 'write-token',
				'INPUT_ANTHROPIC-API-KEY': 'anthropic-key',
				'INPUT_TRIAGE-SKILL': '.agents/skills/triage',
			},
			encoding: 'utf8',
		});

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /No issue in event payload, nothing to do\./);
	});
});
