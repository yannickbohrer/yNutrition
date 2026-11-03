import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Runtime configuration is read from process.env in src/lib/server/config.ts so that the same
 * code works in SvelteKit, Vitest and the CLI scripts (see .env.example for all variables).
 */
export const variables = defineEnvVars({});
