import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ActionContext } from '../../src/context.ts';
import { handleVerifyFix } from '../../src/handlers/verify-fix.ts';
import { labelConfigFromInputs } from '../../src/labels.ts';

const originalFetch = globalThis.fetch;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
	else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
});

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
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

describe('handleVerifyFix integration', () => {
	it('falls back to legacy flue fix branches and verifies only after PR creation', async () => {
		process.env.ANTHROPIC_API_KEY = 'test-key';
		const events: string[] = [];
		let anthropicCalls = 0;
		let createdPrHead: string | null = null;

		globalThis.fetch = async (input, init) => {
			const url = String(input);
			if (url.startsWith('https://api.anthropic.com/')) {
				anthropicCalls += 1;
				if (anthropicCalls === 1) {
					return anthropicStream({
						status: 'confirmed',
						reasoning: 'The reporter confirmed the fix works.',
					});
				}
				return anthropicStream({
					title: 'Fix confirmed issue',
					body: 'Closes #123',
				});
			}

			if (url.endsWith('/git/matching-refs/heads/triagebot/fix-123')) {
				return jsonResponse([]);
			}
			if (url.endsWith('/git/matching-refs/heads/flue/fix-123')) {
				return jsonResponse([{ ref: 'refs/heads/flue/fix-123' }]);
			}
			if (url.endsWith('/issues/123')) {
				return jsonResponse({
					title: 'Example issue',
					body: 'Issue body',
					user: { login: 'reporter' },
					labels: [{ name: 'triage: fix pending' }],
					created_at: '2026-01-01T00:00:00Z',
					state: 'open',
					number: 123,
					html_url: 'https://github.com/withastro/astro/issues/123',
				});
			}
			if (url.endsWith('/issues/123/comments?per_page=100')) {
				return jsonResponse([
					{
						user: { login: 'reporter' },
						author_association: 'CONTRIBUTOR',
						body: 'I can confirm this fixes the issue.',
						created_at: '2026-01-01T00:00:00Z',
					},
				]);
			}
			if (url.includes('/pulls?head=withastro%3Aflue%2Ffix-123&state=open')) {
				return jsonResponse([]);
			}
			if (url.endsWith('/pulls') && init?.method === 'POST') {
				createdPrHead = JSON.parse(String(init.body)).head;
				events.push('create-pr');
				return jsonResponse({
					number: 456,
					html_url: 'https://github.com/withastro/astro/pull/456',
				});
			}
			if (url.endsWith('/issues/456/labels') && init?.method === 'POST') {
				events.push('label-pr');
				return jsonResponse([]);
			}
			if (
				url.endsWith('/issues/123/labels/triage%3A%20fix%20pending') &&
				init?.method === 'DELETE'
			) {
				events.push('remove-pending');
				return new Response('', { status: 200 });
			}
			if (url.endsWith('/issues/123/labels') && init?.method === 'POST') {
				const labels = JSON.parse(String(init.body)).labels;
				if (labels.includes('triage: fix verified')) events.push('add-verified');
				return jsonResponse([]);
			}
			if (url.endsWith('/issues/123/comments') && init?.method === 'POST') {
				events.push('comment-issue');
				return jsonResponse({});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		};

		const ctx: ActionContext = {
			repo: 'withastro/astro',
			readToken: 'read-token',
			writeToken: 'write-token',
			anthropicApiKey: 'test-key',
			triageSkill: '.agents/skills/triage',
			prSkill: null,
			prSkillName: 'astro-pr-writer',
			buildCommand: null,
			triageModel: 'anthropic/claude-sonnet-4-6',
			verificationModel: 'anthropic/claude-sonnet-4-6',
			labels: labelConfigFromInputs(() => ''),
			botLogins: ['github-actions[bot]', 'astrobot-houston'],
		};

		await handleVerifyFix(123, ctx);

		assert.equal(createdPrHead, 'flue/fix-123');
		assert.deepEqual(events, [
			'create-pr',
			'label-pr',
			'remove-pending',
			'add-verified',
			'comment-issue',
		]);
	});
});
