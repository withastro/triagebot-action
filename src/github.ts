/**
 * GitHub API helpers. All functions accept explicit tokens so the caller
 * controls whether a read or write token is used.
 */

import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import * as v from 'valibot';

const execAsync = promisify(execCb);

function headers(token: string): Record<string, string> {
	return {
		Authorization: `token ${token}`,
		'Content-Type': 'application/json',
		Accept: 'application/vnd.github+json',
	};
}

// ---------- Schemas ----------

export const issueDetailsSchema = v.object({
	title: v.string(),
	body: v.string(),
	author: v.object({ login: v.string() }),
	labels: v.array(v.looseObject({ name: v.string() })),
	createdAt: v.string(),
	state: v.string(),
	number: v.number(),
	url: v.string(),
	comments: v.array(
		v.looseObject({
			author: v.object({ login: v.string() }),
			authorAssociation: v.string(),
			body: v.string(),
			createdAt: v.string(),
		}),
	),
});
export type IssueDetails = v.InferOutput<typeof issueDetailsSchema>;

export const repoLabelSchema = v.object({
	name: v.string(),
	description: v.nullable(v.string()),
});
export type RepoLabel = v.InferOutput<typeof repoLabelSchema>;

// ---------- Issues ----------

export async function fetchIssueDetails(
	repo: string,
	issueNumber: number,
	token: string,
): Promise<IssueDetails> {
	const [issueRes, commentsRes] = await Promise.all([
		fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
			headers: headers(token),
		}),
		fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100`, {
			headers: headers(token),
		}),
	]);

	if (!issueRes.ok) {
		throw new Error(
			`Failed to fetch issue ${issueNumber} (HTTP ${issueRes.status}): ${await issueRes.text()}`,
		);
	}
	if (!commentsRes.ok) {
		throw new Error(
			`Failed to fetch comments for issue ${issueNumber} (HTTP ${commentsRes.status}): ${await commentsRes.text()}`,
		);
	}

	const issue = (await issueRes.json()) as Record<string, unknown>;
	const rawComments = (await commentsRes.json()) as Record<string, unknown>[];

	return v.parse(issueDetailsSchema, {
		title: issue.title,
		body: issue.body ?? '',
		author: { login: (issue.user as Record<string, unknown>)?.login },
		labels: issue.labels,
		createdAt: issue.created_at,
		state: issue.state,
		number: issue.number,
		url: issue.html_url,
		comments: rawComments.map((c) => ({
			author: { login: (c.user as Record<string, unknown>)?.login },
			authorAssociation: c.author_association,
			body: c.body,
			createdAt: c.created_at,
		})),
	});
}

// ---------- Labels ----------

export async function fetchRepoLabels(
	repo: string,
	token: string,
): Promise<{ priorityLabels: RepoLabel[]; packageLabels: RepoLabel[] }> {
	const allLabels: RepoLabel[] = [];
	let page = 1;

	while (true) {
		const res = await fetch(
			`https://api.github.com/repos/${repo}/labels?per_page=100&page=${page}`,
			{ headers: headers(token) },
		);
		if (!res.ok) {
			throw new Error(`Failed to fetch labels (HTTP ${res.status}): ${await res.text()}`);
		}
		const batch = v.parse(v.array(repoLabelSchema), await res.json());
		allLabels.push(...batch);
		if (batch.length < 100) break;
		page++;
	}

	return {
		priorityLabels: allLabels.filter((l) => /^- P\d/.test(l.name)),
		packageLabels: allLabels.filter((l) => l.name.startsWith('pkg:')),
	};
}

export async function addLabels(
	repo: string,
	issueNumber: number,
	labels: string[],
	token: string,
): Promise<void> {
	const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify({ labels }),
	});
	if (!res.ok) {
		throw new Error(`Failed to add labels (HTTP ${res.status}): ${await res.text()}`);
	}
}

export async function removeLabel(
	repo: string,
	issueNumber: number,
	label: string,
	token: string,
): Promise<void> {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
		{
			method: 'DELETE',
			headers: headers(token),
		},
	);
	if (!res.ok && res.status !== 404) {
		throw new Error(`Failed to remove label (HTTP ${res.status}): ${await res.text()}`);
	}
}

/**
 * Atomically swap one triage label for another.
 * Removes the old label (if present) and adds the new one.
 */
export async function swapLabel(
	repo: string,
	issueNumber: number,
	oldLabel: string | null,
	newLabel: string,
	token: string,
): Promise<void> {
	if (oldLabel) {
		await removeLabel(repo, issueNumber, oldLabel, token);
	}
	await addLabels(repo, issueNumber, [newLabel], token);
}

// ---------- Comments ----------

export async function postComment(
	repo: string,
	issueNumber: number,
	body: string,
	token: string,
): Promise<void> {
	const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify({ body }),
	});
	if (!res.ok) {
		throw new Error(`Failed to post comment (HTTP ${res.status}): ${await res.text()}`);
	}
}

// ---------- Pull Requests ----------

export interface PullRequest {
	number: number;
	html_url: string;
}

export async function createPullRequest(
	repo: string,
	options: { head: string; base: string; title: string; body: string },
	token: string,
): Promise<PullRequest> {
	const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
		method: 'POST',
		headers: headers(token),
		body: JSON.stringify({
			head: options.head,
			base: options.base,
			title: options.title,
			body: options.body,
		}),
	});
	if (!res.ok) {
		throw new Error(`Failed to create pull request (HTTP ${res.status}): ${await res.text()}`);
	}
	return (await res.json()) as PullRequest;
}

export async function findPullRequest(
	repo: string,
	head: string,
	token: string,
): Promise<PullRequest | null> {
	const owner = repo.split('/')[0];
	const res = await fetch(
		`https://api.github.com/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${head}`)}&state=open`,
		{ headers: headers(token) },
	);
	if (!res.ok) {
		throw new Error(`Failed to check for existing PR (HTTP ${res.status}): ${await res.text()}`);
	}
	const pulls = await res.json();
	if (!Array.isArray(pulls)) return null;
	return (pulls[0] as PullRequest) ?? null;
}

// ---------- Branches ----------

export async function deleteBranch(repo: string, branch: string, token: string): Promise<void> {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
		{
			method: 'DELETE',
			headers: headers(token),
		},
	);
	if (!res.ok && res.status !== 422) {
		// 422 = ref doesn't exist, which is fine
		throw new Error(`Failed to delete branch (HTTP ${res.status}): ${await res.text()}`);
	}
}

/**
 * Push a branch to origin. Runs outside any sandbox so the write token
 * is never exposed to the LLM agent.
 */
export async function gitPush(
	repo: string,
	branch: string,
	token: string,
	options?: { force?: boolean },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const forceFlag = options?.force ? ' -f' : '';
	const remoteUrl = `https://x-access-token:${token}@github.com/${repo}.git`;
	try {
		const { stdout, stderr } = await execAsync(`git push${forceFlag} ${remoteUrl} ${branch}`);
		return { exitCode: 0, stdout, stderr };
	} catch (err: any) {
		return { exitCode: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
	}
}
