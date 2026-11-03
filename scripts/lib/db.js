// @ts-check
/** Minimal DB helpers for the CLI scripts (plain JS so they run in the slim runtime image). */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export function loadDotEnv() {
	if (process.env.NODE_ENV === 'production') return;
	const f = path.join(ROOT, '.env');
	try {
		if (fs.existsSync(f)) process.loadEnvFile(f);
	} catch {
		/* ignore */
	}
}

export function databasePath() {
	return (
		process.env.DATABASE_PATH || process.env.DATABASE_URL || path.join(ROOT, 'data', 'nutrition.db')
	);
}

/** Open the DB and apply pending migrations. */
export function openAndMigrate(file = databasePath()) {
	fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
	const client = new Database(file);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	client.pragma('busy_timeout = 5000');
	const db = drizzle(client);
	migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR || path.join(ROOT, 'drizzle') });
	return client;
}

/** @param {import('better-sqlite3').Database} client @param {string} key */
export function getSetting(client, key) {
	const row = /** @type {{ value: string } | undefined} */ (
		client.prepare('select value from settings where key = ?').get(key)
	);
	return row ? JSON.parse(row.value) : undefined;
}

/** @param {import('better-sqlite3').Database} client @param {string} key @param {unknown} value */
export function setSetting(client, key, value) {
	client
		.prepare(
			'insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value'
		)
		.run(key, JSON.stringify(value));
}
