import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FlueEvent } from '@flue/runtime';
import { createFlueEventLogger } from '../src/flue-logging.ts';

describe('createFlueEventLogger', () => {
	it('logs thinking, tool, log, and compaction events', () => {
		const lines: string[] = [];
		const logger = createFlueEventLogger((line) => lines.push(line));

		logger.present({ type: 'thinking_start' } as FlueEvent);
		logger.present({ type: 'thinking_delta', delta: 'Checking files\n' } as FlueEvent);
		logger.present({ type: 'thinking_end' } as FlueEvent);
		logger.present({
			type: 'tool_start',
			toolName: 'bash',
			args: { command: 'npm test' },
		} as FlueEvent);
		logger.present({
			type: 'tool_call',
			toolName: 'bash',
			isError: false,
			durationMs: 12,
			result: {
				content: [{ type: 'text', text: 'tests passed' }],
				details: { exitCode: 0 },
			},
		} as FlueEvent);
		logger.present({
			type: 'tool_execution_start',
			toolName: 'read',
			args: { filePath: 'a.ts' },
		} as FlueEvent);
		logger.present({
			type: 'tool_execution_end',
			toolName: 'read',
			isError: true,
			result: { content: [{ type: 'text', text: 'missing' }] },
		} as FlueEvent);
		logger.present({ type: 'log', level: 'info', message: 'hello' } as FlueEvent);
		logger.present({
			type: 'compaction_start',
			reason: 'threshold',
			estimatedTokens: 123,
		} as FlueEvent);
		logger.present({ type: 'compaction', messagesBefore: 10, messagesAfter: 4 } as FlueEvent);

		assert.deepEqual(lines, [
			'[flue] thinking:start',
			'  Checking files',
			'[flue] thinking:done',
			'[flue] tool:start bash $ npm test',
			'[flue] tool:done bash (12ms) exit=0\n  tests passed',
			'[flue] tool:start read args={"filePath":"a.ts"}',
			'[flue] tool:error read\n  missing',
			'[flue] info hello',
			'[flue] compaction:start reason=threshold tokens=123',
			'[flue] compaction:done messages 10 -> 4',
		]);
	});

	it('buffers assistant text until full lines or flush events', () => {
		const lines: string[] = [];
		const logger = createFlueEventLogger((line) => lines.push(line));

		logger.present({ type: 'text_delta', text: 'first line\npartial' } as FlueEvent);
		logger.present({ type: 'text_delta', text: ' line\n' } as FlueEvent);
		logger.present({ type: 'turn' } as FlueEvent);

		assert.deepEqual(lines, ['[flue] assistant', '  first line', '  partial line']);
	});
});
