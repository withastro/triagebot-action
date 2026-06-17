/**
 * Label configuration and management.
 *
 * Every triage state maps to exactly one label. The action swaps labels
 * atomically: remove the old one, add the new one. At any point in time,
 * an issue should have at most one `triage:` label from this set.
 */

export interface LabelConfig {
	needsTriage: string;
	notActionable: string;
	needsReproduction: string;
	skipped: string;
	unableToReproduce: string;
	unableToFix: string;
	fixPending: string;
	fixRejected: string;
	fixVerified: string;
	prFixVerified: string;
}

export function labelConfigFromInputs(getInput: (name: string) => string): LabelConfig {
	return {
		needsTriage: getInput('label-needs-triage') || 'triage: needs triage',
		notActionable: getInput('label-not-actionable') || 'triage: not actionable',
		needsReproduction: getInput('label-needs-reproduction') || 'triage: needs reproduction',
		skipped: getInput('label-skipped') || 'triage: skipped',
		unableToReproduce: getInput('label-unable-to-reproduce') || 'triage: unable to reproduce',
		unableToFix: getInput('label-unable-to-fix') || 'triage: unable to fix',
		fixPending: getInput('label-fix-pending') || 'triage: fix pending',
		fixRejected: getInput('label-fix-rejected') || 'triage: fix rejected',
		fixVerified: getInput('label-fix-verified') || 'triage: fix verified',
		prFixVerified: getInput('pr-label-fix-verified') || 'fix verified',
	};
}

/** All triage state labels (excludes the PR label). */
export function allTriageLabels(config: LabelConfig): string[] {
	return [
		config.needsTriage,
		config.notActionable,
		config.needsReproduction,
		config.skipped,
		config.unableToReproduce,
		config.unableToFix,
		config.fixPending,
		config.fixRejected,
		config.fixVerified,
	];
}

/** Labels that allow re-triage when a new comment arrives. */
export function retriageableLabels(config: LabelConfig): string[] {
	return [
		config.needsTriage,
		config.needsReproduction,
		config.unableToReproduce,
		config.unableToFix,
		config.fixRejected,
	];
}

/** Terminal labels — no further bot action on new comments. */
export function terminalLabels(config: LabelConfig): string[] {
	return [config.fixVerified, config.notActionable, config.skipped];
}

/**
 * Find the current triage label on an issue, if any.
 * Returns the first matching triage label, or null.
 */
export function currentTriageLabel(issueLabels: string[], config: LabelConfig): string | null {
	const all = allTriageLabels(config);
	return issueLabels.find((l) => all.includes(l)) ?? null;
}
