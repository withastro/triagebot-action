import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { gitCommit } from '../src/github.ts';

const originalCwd = process.cwd();
let repo: string | null = null;

function git(args: string[], cwd: string): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

beforeEach(() => {
	repo = mkdtempSync(join(tmpdir(), 'triagebot-commit-'));
	git(['init', '-b', 'main'], repo);
	git(['config', 'user.email', 'test@example.com'], repo);
	git(['config', 'user.name', 'Triage Test'], repo);
	writeFileSync(join(repo, 'README.md'), 'initial\n');
	git(['add', '-A'], repo);
	git(['commit', '-m', 'initial'], repo);
	// gitCommit operates in process.cwd(), matching how gitPush runs in the action.
	process.chdir(repo);
});

afterEach(() => {
	process.chdir(originalCwd);
	if (repo) {
		rmSync(repo, { recursive: true, force: true });
		repo = null;
	}
});

describe('gitCommit', () => {
	it('preserves a message with backticks, parentheses, quotes, and newlines verbatim', async () => {
		// This is the class of message that broke the old `git commit -m "<json>"`
		// shell command (backticks triggered command substitution in /bin/sh).
		const message = [
			"fix: BASE_URL no longer ends with a trailing slash when trailingSlash is 'never'",
			'',
			"`removeTrailingForwardSlash('/')` returns `''`, but then `prependForwardSlash('')`",
			'adds it back → `\'/\'`. Also guards against $(whoami) and "double quotes".',
			'',
			'Fixes #15440',
		].join('\n');

		writeFileSync(join(repo as string, 'change.txt'), 'change\n');
		const result = await gitCommit(message);

		assert.equal(result.exitCode, 0, `commit failed: ${result.stderr}`);
		const stored = git(['log', '-1', '--pretty=%B'], repo as string).replace(/\n+$/, '');
		assert.equal(stored, message);
	});

	it('stages new files before committing', async () => {
		writeFileSync(join(repo as string, 'new-file.txt'), 'hello\n');
		const result = await gitCommit('chore: add file');

		assert.equal(result.exitCode, 0, result.stderr);
		const files = git(['show', '--name-only', '--pretty=format:', 'HEAD'], repo as string).trim();
		assert.match(files, /new-file\.txt/);
	});

	it('returns a non-zero exitCode when there is nothing to commit', async () => {
		const result = await gitCommit('chore: noop');
		assert.notEqual(result.exitCode, 0);
	});
});
