import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { config } from '../config';

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function openDb(file: string): DB {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
	const client = new Database(file);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	client.pragma('busy_timeout = 5000');
	client.pragma('synchronous = NORMAL');
	return drizzle(client, { schema }) as DB;
}

export function migrationsFolder(): string {
	const candidates = [
		process.env.MIGRATIONS_DIR,
		path.resolve('drizzle'),
		path.resolve(import.meta.dirname ?? '.', '../../../../drizzle')
	].filter(Boolean) as string[];
	const found = candidates.find((c) => fs.existsSync(path.join(c, 'meta', '_journal.json')));
	if (!found) throw new Error('drizzle migrations folder not found');
	return found;
}

export function runMigrations(db: DB) {
	migrate(db, { migrationsFolder: migrationsFolder() });
}

let _db: DB | undefined;

/** Lazily opened singleton (migrations are applied on first open). */
export function getDb(): DB {
	if (!_db) {
		_db = openDb(config.databasePath);
		runMigrations(_db);
	}
	return _db;
}

/** For tests: replace the singleton (e.g. with an in-memory DB). */
export function setDb(db: DB | undefined) {
	_db = db;
}

export function createTestDb(): DB {
	const db = openDb(':memory:');
	runMigrations(db);
	return db;
}

export { schema };
