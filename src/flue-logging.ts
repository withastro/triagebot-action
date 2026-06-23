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
				case 'tool_start':
					flush();
					write(`[flue] tool:start ${event.toolName}`);
					break;
				case 'tool':
					write(`[flue] tool:${event.isError ? 'error' : 'done'} ${event.toolName}`);
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
