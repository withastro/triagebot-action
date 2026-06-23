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
		logger.present({ type: 'tool_start', toolName: 'read' } as FlueEvent);
		logger.present({ type: 'tool', toolName: 'read', isError: false } as FlueEvent);
		logger.present({ type: 'tool', toolName: 'bash', isError: true } as FlueEvent);
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
			'[flue] tool:start read',
			'[flue] tool:done read',
			'[flue] tool:error bash',
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
