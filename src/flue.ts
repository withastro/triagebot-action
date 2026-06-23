import type { CreatedAgent, FlueSession } from '@flue/runtime';
import {
	Bash,
	bashFactoryToSessionEnv,
	createFlueContext,
	InMemoryFs,
	InMemorySessionStore,
	resolveModel,
} from '@flue/runtime/internal';

const defaultStore = new InMemorySessionStore();

async function createDefaultEnv() {
	const fs = new InMemoryFs();
	return bashFactoryToSessionEnv(
		() =>
			new Bash({
				fs,
				network: { dangerouslyAllowFullInternetAccess: true },
			}),
	);
}

export async function createSession(agent: CreatedAgent): Promise<FlueSession> {
	const ctx = createFlueContext({
		id: `triagebot-action-${process.env.GITHUB_RUN_ID ?? Date.now()}-${
			process.env.GITHUB_RUN_ATTEMPT ?? '0'
		}`,
		payload: {},
		env: process.env,
		agentConfig: {
			systemPrompt: '',
			skills: {},
			roles: {},
			model: undefined,
			resolveModel,
		},
		createDefaultEnv,
		defaultStore,
	});
	const harness = await ctx.init(agent);
	return harness.session();
}
