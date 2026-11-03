#!/usr/bin/env node
// @ts-check
/**
 * Online-safe SQLite backup (uses SQLite's backup API, fine while the app is running).
 *   node scripts/backup.js [targetDir] [keep]
 * Defaults: <dir of DB>/backups, keep 10.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { databasePath, loadDotEnv } from './lib/db.js';

loadDotEnv();
const src = databasePath();
if (!fs.existsSync(src)) {
	console.log(`[backup] no database at ${src} yet — nothing to back up`);
	process.exit(0);
}
const dir = process.argv[2] || path.join(path.dirname(src), 'backups');
const keep = Number(process.argv[3] ?? 10);
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(dir, `nutrition-${stamp}.db`);
const db = new Database(src, { readonly: true });
await db.backup(target);
db.close();
console.log(`[backup] wrote ${target}`);

const files = fs
	.readdirSync(dir)
	.filter((f) => /^nutrition-.*\.db$/.test(f))
	.sort();
for (const f of files.slice(0, Math.max(0, files.length - keep))) {
	fs.unlinkSync(path.join(dir, f));
	console.log(`[backup] removed old ${f}`);
}
