import type { FlueEvent } from '@flue/runtime';

export interface FlueEventLogger {
	present(event: FlueEvent): void;
	flush(): void;
}

export function createFlueEventLogger(
	write: (line: string) => void = console.info,
): FlueEventLogger {
	let textBuffer = '';
	let thinkingBuffer = '';
	let textStarted = false;
	const startedToolCalls = new Set<string>();
	const endedToolCalls = new Set<string>();

	const beginText = () => {
		if (textStarted) return;
		textStarted = true;
		write('[flue] assistant');
	};

	const flushText = () => {
		if (!textBuffer) return;
		beginText();
		writeLines(textBuffer, (line) => `  ${line}`, write);
		textBuffer = '';
	};

	const flushThinking = () => {
		if (!thinkingBuffer) return;
		writeLines(thinkingBuffer, (line) => `  ${line}`, write);
		thinkingBuffer = '';
	};

	const flush = () => {
		flushText();
		flushThinking();
	};

	return {
		flush,
		present(event) {
			switch (event.type) {
				case 'text_delta':
					flushThinking();
					beginText();
					textBuffer = consumeCompleteLines(textBuffer + event.text, write, (line) => `  ${line}`);
					break;
				case 'thinking_start':
					flushText();
					write('[flue] thinking:start');
					break;
				case 'thinking_delta':
					flushText();
					thinkingBuffer = consumeCompleteLines(
						thinkingBuffer + event.delta,
						write,
						(line) => `  ${line}`,
					);
					break;
				case 'thinking_end':
					flushThinking();
					write('[flue] thinking:done');
					break;
				case 'tool_execution_start':
				case 'tool_start':
					flush();
					if (alreadySeenToolCall(event, startedToolCalls)) break;
					write(`[flue] tool:start ${event.toolName}${formatToolArgs(event)}`);
					break;
				case 'tool_execution_end':
				case 'tool_call':
					if (alreadySeenToolCall(event, endedToolCalls)) break;
					write(
						`[flue] tool:${event.isError ? 'error' : 'done'} ${event.toolName}${formatDuration(event)}${formatToolResult(event)}`,
					);
					break;
				case 'tool_execution_update':
					flush();
					write(`[flue] tool:update ${event.toolName}${formatPartialResult(event)}`);
					break;
				case 'log':
					flush();
					write(`[flue] ${event.level} ${event.message}`);
					break;
				case 'compaction_start':
					flush();
					write(`[flue] compaction:start reason=${event.reason} tokens=${event.estimatedTokens}`);
					break;
				case 'compaction':
					write(
						`[flue] compaction:done messages ${event.messagesBefore} -> ${event.messagesAfter}`,
					);
					break;
				case 'turn':
				case 'idle':
				case 'submission_settled':
				case 'run_end':
					flush();
					break;
			}
		},
	};
}

function alreadySeenToolCall(event: FlueEvent, seen: Set<string>): boolean {
	if (!('toolCallId' in event) || typeof event.toolCallId !== 'string') return false;
	if (seen.has(event.toolCallId)) return true;
	seen.add(event.toolCallId);
	return false;
}

function formatToolArgs(event: FlueEvent): string {
	if (!('args' in event) || event.args === undefined) return '';
	const command = readPath(event.args, ['command']);
	if (typeof command === 'string') return ` $ ${redact(command)}`;
	return ` args=${formatValue(event.args)}`;
}

function formatDuration(event: FlueEvent): string {
	if (!('durationMs' in event) || typeof event.durationMs !== 'number') return '';
	return ` (${event.durationMs}ms)`;
}

function formatPartialResult(event: FlueEvent): string {
	if (!('partialResult' in event) || event.partialResult === undefined) return '';
	return ` partial=${formatValue(event.partialResult)}`;
}

function formatToolResult(event: FlueEvent): string {
	if (!('result' in event) || event.result === undefined) return '';
	const details = readPath(event.result, ['details']);
	const exitCode = readPath(details, ['exitCode']);
	const suffix = typeof exitCode === 'number' ? ` exit=${exitCode}` : '';
	const output = extractTextResult(event.result);
	if (!output) return suffix ? ` ${suffix.trim()}` : '';
	return `${suffix}\n${indentLines(truncate(redact(output)), '  ')}`;
}

function extractTextResult(value: unknown): string | null {
	const content = readPath(value, ['content']);
	if (!Array.isArray(content)) return null;
	const text = content
		.map((item) => readPath(item, ['text']))
		.filter((item): item is string => typeof item === 'string')
		.join('\n');
	return text || null;
}

function readPath(value: unknown, path: string[]): unknown {
	let current = value;
	for (const key of path) {
		if (!current || typeof current !== 'object' || !(key in current)) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function formatValue(value: unknown): string {
	return truncate(redact(safeJson(value)));
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function indentLines(value: string, prefix: string): string {
	return value
		.split('\n')
		.map((line) => `${prefix}${line}`)
		.join('\n');
}

function truncate(value: string): string {
	const max = 4000;
	if (value.length <= max) return value;
	return `${value.slice(0, max)}... [truncated ${value.length - max} chars]`;
}

function redact(value: string): string {
	return value.replace(/x-access-token:[^@\s]+/g, 'x-access-token:***');
}

function consumeCompleteLines(
	value: string,
	write: (line: string) => void,
	format: (line: string) => string,
): string {
	const lines = value.split('\n');
	const remainder = lines.pop() ?? '';
	for (const line of lines) write(format(line));
	return remainder;
}

function writeLines(
	value: string,
	format: (line: string) => string,
	write: (line: string) => void,
): void {
	for (const line of value.split('\n')) {
		if (line) write(format(line));
	}
}
