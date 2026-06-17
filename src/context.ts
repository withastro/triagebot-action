/**
 * Shared context passed to all handlers. Holds config, tokens, and repo info.
 */

import type { LabelConfig } from './labels.ts';

export interface ActionContext {
	repo: string;
	readToken: string;
	writeToken: string;
	anthropicApiKey: string;
	triageSkill: string;
	prSkill: string | null;
	prSkillName: string;
	buildCommand: string | null;
	triageModel: string;
	verificationModel: string;
	labels: LabelConfig;
	botLogins: string[];
}
