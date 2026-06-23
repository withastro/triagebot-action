export function getInput(name: string): string {
	const envName = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
	const legacyEnvName = `INPUT_${name.replace(/[- ]/g, '_').toUpperCase()}`;
	return (process.env[envName] ?? process.env[legacyEnvName] ?? '').trim();
}
