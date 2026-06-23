import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { ActionContext } from '../../src/context.ts';
import { handleTriage } from '../../src/handlers/triage.ts';
import { labelConfigFromInputs } from '../../src/labels.ts';

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
let tempDir: string | null = null;

afterEach(() => {
	process.chdir(originalCwd);
	globalThis.fetch = originalFetch;
	if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
	else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

function run(command: string, args: string[], cwd: string): void {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

function setupRepo(): string {
	tempDir = mkdtempSync(join(tmpdir(), 'triagebot-e2e-'));
	mkdirSync(join(tempDir, '.agents', 'skills', 'triage'), { recursive: true });
	const skillDir = join(tempDir, '.agents', 'skills', 'triage');
	writeFileSync(
		join(skillDir, 'SKILL.md'),
		'---\nname: triage\ndescription: Triage a bug report.\n---\n\n# Triage\n',
	);
	writeFileSync(join(skillDir, 'reproduce.md'), '# Reproduce\n');
	writeFileSync(join(skillDir, 'diagnose.md'), '# Diagnose\n');
	writeFileSync(join(skillDir, 'verify.md'), '# Verify\n');
	writeFileSync(join(skillDir, 'fix.md'), '# Fix\n');
	writeFileSync(join(tempDir, 'README.md'), '# fixture\n');
	run('git', ['init', '-b', 'main'], tempDir);
	run('git', ['config', 'user.email', 'test@example.com'], tempDir);
	run('git', ['config', 'user.name', 'Test'], tempDir);
	run('git', ['add', '.'], tempDir);
	run('git', ['commit', '-m', 'initial'], tempDir);
	process.chdir(tempDir);
	return skillDir;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timeout: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function anthropicStream(toolInput: unknown): Response {
	const encoder = new TextEncoder();
	const body = [
		{
			type: 'message_start',
			message: {
				id: 'msg_test',
				type: 'message',
				role: 'assistant',
				content: [],
				model: 'claude-sonnet-4-6',
				stop_reason: null,
				stop_sequence: null,
				usage: { input_tokens: 1, output_tokens: 1 },
			},
		},
		{
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'tool_use', id: 'toolu_test', name: 'finish', input: {} },
		},
		{
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) },
		},
		{ type: 'content_block_stop', index: 0 },
		{
			type: 'message_delta',
			delta: { stop_reason: 'tool_use', stop_sequence: null },
			usage: { output_tokens: 1 },
		},
		{ type: 'message_stop' },
	]
		.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
		.join('');

	return new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(body));
				controller.close();
			},
		}),
		{ status: 200, headers: { 'content-type': 'text/event-stream' } },
	);
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

describe('mocked triage flow', () => {
	it('runs an opened issue through unable-to-reproduce without real LLM or GitHub calls', async () => {
		const triageSkill = setupRepo();
		process.env.ANTHROPIC_API_KEY = 'test-key';
		const comments: string[] = [];
		const addedLabels: string[][] = [];
		let removedLabel: string | null = null;
		let anthropicCalls = 0;

		globalThis.fetch = async (input, init) => {
			const url = String(input);
			if (url.startsWith('https://api.anthropic.com/')) {
				anthropicCalls += 1;
				if (anthropicCalls > 5) {
					throw new Error('Too many mocked Anthropic calls');
				}
				if (anthropicCalls === 1) {
					return anthropicStream({
						reproducible: false,
						skipped: false,
						skippedReason: null,
					});
				}
				return anthropicStream({
					result:
						'- **Reproduced:** No\n- **Exploration:** No\n- **Unit Test:** No\n- **Priority:** Priority P3: Minor bug.\n',
				});
			}

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
			if (url.endsWith('/issues/123/comments?per_page=100')) return jsonResponse([]);
			if (url.endsWith('/labels?per_page=100&page=1')) {
				return jsonResponse([
					{ name: '- P3: minor bug', description: 'Minor bug' },
					{ name: 'pkg: astro', description: 'Core package' },
				]);
			}
			if (url.endsWith('/issues/123/comments') && init?.method === 'POST') {
				comments.push(JSON.parse(String(init.body)).body);
				return jsonResponse({});
			}
			if (url.includes('/issues/123/labels/') && init?.method === 'DELETE') {
				removedLabel = decodeURIComponent(url.split('/').at(-1) ?? '');
				return new Response('', { status: 200 });
			}
			if (url.endsWith('/issues/123/labels') && init?.method === 'POST') {
				addedLabels.push(JSON.parse(String(init.body)).labels);
				return jsonResponse([]);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		};

		const ctx: ActionContext = {
			repo: 'withastro/astro',
			readToken: 'read-token',
			writeToken: 'write-token',
			anthropicApiKey: 'test-key',
			triageSkill,
			prSkill: null,
			prSkillName: 'astro-pr-writer',
			buildCommand: null,
			triageModel: 'anthropic/claude-sonnet-4-6',
			verificationModel: 'anthropic/claude-sonnet-4-6',
			labels: labelConfigFromInputs(() => ''),
			botLogins: ['github-actions[bot]', 'astrobot-houston'],
		};

		await withTimeout(handleTriage(123, ctx), 10_000);

		assert.equal(anthropicCalls, 2);
		assert.equal(comments.length, 1);
		assert.match(comments[0], /Reproduced/);
		assert.equal(removedLabel, 'triage: needs triage');
		assert.deepEqual(addedLabels, [['triage: unable to reproduce']]);
	});
});
