#!/usr/bin/env node
// @ts-check
/**
 * Container entrypoint: apply migrations, load/refresh the Swiss food database, start the server.
 * The server itself prints the first-run setup link when no passkey exists yet.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, databasePath, loadDotEnv, openAndMigrate } from './lib/db.js';

loadDotEnv();

if (process.env.NODE_ENV === 'production') {
	const secret = process.env.SESSION_SECRET ?? '';
	if (secret.length < 32) {
		console.error(
			'[nutrition] SESSION_SECRET must be set to a random string of at least 32 characters.'
		);
		process.exit(1);
	}
	if (!process.env.ORIGIN) {
		console.error('[nutrition] ORIGIN must be set (e.g. https://nutrition.example.com).');
		process.exit(1);
	}
}

console.log(`[nutrition] database: ${databasePath()}`);
openAndMigrate().close();

const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/import-swissfcd.js'), '--load'], {
	stdio: 'inherit'
});
if (r.status !== 0) {
	console.error('[nutrition] Swiss food database import failed');
	process.exit(r.status ?? 1);
}

await import(path.join(ROOT, 'build/index.js'));
