import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { ActionContext } from '../../src/context.ts';
import { handleTriage } from '../../src/handlers/triage.ts';
import { labelConfigFromInputs } from '../../src/labels.ts';

const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
let tempDir: string | null = null;

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.chdir(originalCwd);
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

function createTriageSkill(): string {
	tempDir = mkdtempSync(join(tmpdir(), 'triagebot-action-'));
	const skillDir = join(tempDir, '.agents', 'skills', 'triage');
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(
		join(skillDir, 'SKILL.md'),
		'---\nname: triage\ndescription: Triage a bug report.\n---\n\n# Triage\n',
	);
	writeFileSync(join(skillDir, 'reproduce.md'), '# Reproduce\n');
	writeFileSync(join(skillDir, 'diagnose.md'), '# Diagnose\n');
	writeFileSync(join(skillDir, 'verify.md'), '# Verify\n');
	writeFileSync(join(skillDir, 'fix.md'), '# Fix\n');
	process.chdir(tempDir);
	return skillDir;
}

function mockGitHubApi(): void {
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		if (url.endsWith('/issues/123')) {
			return jsonResponse({
				title: 'Example issue',
				body: 'Issue body',
				user: { login: 'reporter' },
				labels: [{ name: 'triage: needs triage' }],
				created_at: '2026-01-01T00:00:00Z',
				state: 'open',
				number: 123,
				html_url: 'https://github.com/withastro/astro/issues/123',
			});
		}
		if (url.endsWith('/issues/123/comments?per_page=100')) {
			return jsonResponse([]);
		}
		if (url.endsWith('/issues/123/comments') && init?.method === 'POST') {
			return jsonResponse({});
		}
		if (url.includes('/issues/123/labels/')) {
			return new Response('', { status: 200 });
		}
		if (url.endsWith('/issues/123/labels') && init?.method === 'POST') {
			return jsonResponse([]);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	};
}

describe('handleTriage integration', () => {
	it('does not reject because triage-skill is provided as an action input directory path', async () => {
		mockGitHubApi();
		const ctx: ActionContext = {
			repo: 'withastro/astro',
			readToken: 'read-token',
			writeToken: 'write-token',
			anthropicApiKey: 'anthropic-key',
			triageSkill: createTriageSkill(),
			prSkill: null,
			prSkillName: 'astro-pr-writer',
			buildCommand: null,
			triageModel: false as unknown as string,
			verificationModel: false as unknown as string,
			labels: labelConfigFromInputs(() => ''),
			botLogins: ['github-actions[bot]', 'astrobot-houston'],
		};

		let error: unknown;
		try {
			await handleTriage(123, ctx);
		} catch (err) {
			error = err;
		}

		const message = String(error instanceof Error ? error.stack : error);
		assert.doesNotMatch(message, /skills\[0\]/);
		assert.doesNotMatch(message, /Skill "triage" is not registered/);
	});
});
