/**
 * Entry point for the triagebot GitHub Action.
 *
 * Reads the GitHub event payload and action inputs, routes to the
 * appropriate handler via the FSM router.
 */

import { readFileSync } from 'node:fs';
import type { ActionContext } from './context.ts';
import { handleCleanup } from './handlers/cleanup.ts';
import { handleRetriage } from './handlers/retriage.ts';
import { handleTriage } from './handlers/triage.ts';
import { handleVerifyFix } from './handlers/verify-fix.ts';
import { getInput } from './input.ts';
import { labelConfigFromInputs } from './labels.ts';
import { type GitHubEvent, route } from './router.ts';

// ---------- GitHub Actions helpers ----------

function parseBotLogins(input: string): string[] {
	const defaults = ['github-actions[bot]'];
	if (!input) return defaults;
	const extra = input
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return [...new Set([...defaults, ...extra])];
}

function getRequiredInput(name: string): string {
	const value = getInput(name);
	if (!value) {
		throw new Error(`Required input "${name}" is not set`);
	}
	return value;
}

// ---------- Main ----------

async function main(): Promise<void> {
	// Read the GitHub event payload.
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) {
		throw new Error('GITHUB_EVENT_PATH is not set');
	}
	const payload = JSON.parse(readFileSync(eventPath, 'utf-8'));

	const repo = process.env.GITHUB_REPOSITORY;
	if (!repo) {
		throw new Error('GITHUB_REPOSITORY is not set');
	}

	// Build the action context from inputs.
	const labels = labelConfigFromInputs(getInput);
	const ctx: ActionContext = {
		repo,
		readToken: getRequiredInput('read-token'),
		writeToken: getRequiredInput('write-token'),
		anthropicApiKey: getInput('anthropic-api-key') || null,
		cloudflareApiKey: getInput('cloudflare-api-key') || null,
		cloudflareAccountId: getInput('cloudflare-account-id') || null,
		openaiApiKey: getInput('openai-api-key') || null,
		triageSkill: getRequiredInput('triage-skill'),
		prSkill: getInput('pr-skill') || null,
		prSkillName: getInput('pr-skill-name') || 'pr-writer',
		autoPrOnFix: getInput('auto-pr-on-fix') === 'true',
		buildCommand: getInput('build-command') || null,
		triageModel: getInput('triage-model') || 'anthropic/claude-opus-4-6',
		verificationModel: getInput('verification-model') || 'anthropic/claude-sonnet-4-6',
		labels,
		botLogins: parseBotLogins(getInput('bot-logins')),
	};

	// Validate provider credentials before touching any globals so we don't
	// pollute process.env on an invalid configuration.
	const hasCloudflare = !!ctx.cloudflareApiKey && !!ctx.cloudflareAccountId;
	if (!ctx.anthropicApiKey && !ctx.openaiApiKey && !hasCloudflare) {
		throw new Error(
			'No LLM credentials provided. Set "anthropic-api-key" or "openai-api-key", or set both "cloudflare-api-key" and "cloudflare-account-id" to use Workers AI models.',
		);
	}
	if (ctx.cloudflareApiKey && !ctx.cloudflareAccountId) {
		throw new Error(
			'"cloudflare-api-key" is set but "cloudflare-account-id" is missing; both are required for Workers AI.',
		);
	}

	// Provide LLM credentials to Flue/pi-ai via env. The provider is selected by
	// the `triage-model` / `verification-model` prefix (e.g. "anthropic/..." or
	// "cloudflare-workers-ai/..."), and pi-ai reads the matching env var.
	if (ctx.anthropicApiKey) {
		process.env.ANTHROPIC_API_KEY = ctx.anthropicApiKey;
	}
	if (ctx.cloudflareApiKey) {
		process.env.CLOUDFLARE_API_KEY = ctx.cloudflareApiKey;
	}
	if (ctx.cloudflareAccountId) {
		process.env.CLOUDFLARE_ACCOUNT_ID = ctx.cloudflareAccountId;
	}
	if (ctx.openaiApiKey) {
		process.env.OPENAI_API_KEY = ctx.openaiApiKey;
	}

	// Parse the event into the shape the router expects.
	const issue = payload.issue;
	if (!issue) {
		console.info('No issue in event payload, nothing to do.');
		return;
	}

	const event: GitHubEvent = {
		action: payload.action,
		isPullRequest: !!issue.pull_request,
		issueNumber: issue.number,
		issueLabels: (issue.labels ?? []).map((l: { name: string }) => l.name),
		commentAuthor: payload.comment?.user?.login,
		botLogins: ctx.botLogins,
	};

	const action = route(event, labels);
	console.info(`Router decision: ${action.type}`, action);

	switch (action.type) {
		case 'triage':
			await handleTriage(action.issueNumber, ctx);
			break;
		case 'retriage':
			await handleRetriage(action.issueNumber, action.currentLabel, ctx);
			break;
		case 'verify-fix':
			await handleVerifyFix(action.issueNumber, ctx);
			break;
		case 'cleanup':
			await handleCleanup(action.issueNumber, ctx);
			break;
		case 'skip':
			console.info(`Skipping: ${action.reason}`);
			break;
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
