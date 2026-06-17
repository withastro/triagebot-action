/**
 * Cleanup handler. Deletes the fix branch when an issue is closed.
 */

import type { ActionContext } from '../context.ts';
import { deleteBranch } from '../github.ts';

export async function handleCleanup(issueNumber: number, ctx: ActionContext): Promise<void> {
	const branch = `triagebot/fix-${issueNumber}`;
	try {
		await deleteBranch(ctx.repo, branch, ctx.writeToken);
		console.info(`Deleted branch ${branch}`);
	} catch {
		console.info(`No branch ${branch} to clean up`);
	}
}
