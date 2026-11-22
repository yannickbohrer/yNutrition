#!/usr/bin/env node
// @ts-check
/**
 * Rebuild a regular backup file from the incremental backups (base snapshot + journal).
 *   node scripts/restore.js <backupDir> [out.json] [--chain chain-YYYY-MM-DD]
 *
 * Uses the newest chain unless --chain is given. Writes a regular backup JSON; load it with
 * Einstellungen → Daten → Importieren (replaces the user data, keeps the Swiss reference data).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { replay, stateToBackup } from './lib/journal.js';

/** @param {string} dir @param {string | undefined} chain */
export function restoreChain(dir, chain) {
	const chains = fs
		.readdirSync(dir)
		.filter((f) => /^chain-/.test(f) && fs.existsSync(path.join(dir, f, 'base.json.gz')))
		.sort();
	const name = chain ?? chains[chains.length - 1];
	if (!name || !chains.includes(name))
		throw new Error(`no backup chain${chain ? ` ${chain}` : ''} in ${dir}`);
	const base = JSON.parse(
		zlib.gunzipSync(fs.readFileSync(path.join(dir, name, 'base.json.gz'))).toString('utf8')
	);
	const jf = path.join(dir, name, 'journal.jsonl');
	/** @type {import('./lib/journal.js').JournalLine[]} */
	const lines = [];
	if (fs.existsSync(jf)) {
		for (const l of fs.readFileSync(jf, 'utf8').split('\n')) {
			if (!l.trim()) continue;
			try {
				lines.push(JSON.parse(l));
			} catch {
				// a torn last line (crash while appending) carries nothing that was confirmed
				console.warn('[restore] skipping an unreadable journal line');
			}
		}
	}
	return { chain: name, changes: lines.length, backup: stateToBackup(replay(base, lines)) };
}

const isMain =
	process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
	const args = process.argv.slice(2);
	const flag = (/** @type {string} */ f) => {
		const i = args.indexOf(f);
		if (i < 0) return undefined;
		const v = args[i + 1];
		args.splice(i, 2);
		return v;
	};
	const chain = flag('--chain');
	const [dir, out] = args;
	if (!dir) {
		console.error('usage: node scripts/restore.js <backupDir> [out.json] [--chain <name>]');
		process.exit(2);
	}
	const r = restoreChain(dir, chain);
	const b = r.backup;
	console.log(
		`[restore] ${r.chain}: ${r.changes} journal changes → ${b.entries.length} entries, ${b.weights.length} weights, ${b.foods.length} foods, ${b.targetHistory.length} target changes`
	);
	const file = out ?? `nutrition-restore-${r.chain.slice(6)}.json`;
	fs.writeFileSync(file, JSON.stringify(b));
	console.log(`[restore] wrote ${file}`);
}
