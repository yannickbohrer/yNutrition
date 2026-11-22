/**
 * Incremental backups to a host directory (`BACKUP_DIR`, `/backups` in the container).
 *
 * Layout: one folder per chain, `chain-<YYYY-MM-DD>/` with
 *   base.json.gz   snapshot of all user data when the chain started (written once)
 *   journal.jsonl  every change after that, appended (nothing is written when nothing changed)
 * plus `status.json` at the top for `deploy.sh --status`.
 *
 * A new chain starts on the first run, at the start of a new year, when the journal format
 * changes, or when this database doesn't know the chain on disk (e.g. it was restored). Old chains
 * are kept. `scripts/restore.js` turns the newest chain back into a regular backup file.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { lt, and, lte } from 'drizzle-orm';
// shared with scripts/restore.js (plain JS for the runtime image)
import { baseSnapshot, journalSince } from '../../../scripts/lib/journal.js';
import { getDb, type DB } from './db';
import { changeLog } from './db/schema';
import { getSetting, setSetting } from './settings';
import { todayLocal } from '../dates';

/** Bump when the journal's row format changes (forces a new chain). */
export const JOURNAL_FORMAT = 1;
const STATE_KEY = 'backup_job';
/** exported journal rows are kept this long in the database */
const KEEP_IN_DB_MS = 30 * 86_400_000;

interface JobState {
	chain: string;
	year: string;
	format: number;
	/** last change_log seq written to the chain's journal */
	seq: number;
}

export interface BackupRunResult {
	chain: string;
	newChain: boolean;
	appended: number;
}

function writeAtomic(file: string, data: Buffer | string) {
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, data);
	const fd = fs.openSync(tmp, 'r');
	fs.fsyncSync(fd);
	fs.closeSync(fd);
	fs.renameSync(tmp, file);
}

function appendDurable(file: string, data: string) {
	const fd = fs.openSync(file, 'a');
	try {
		fs.writeSync(fd, data);
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}

export function runBackup(
	dir: string,
	db: DB = getDb(),
	today: string = todayLocal()
): BackupRunResult {
	const client = db.$client;
	let state = getSetting<JobState>(STATE_KEY, db);
	const year = today.slice(0, 4);
	const chainOk =
		state &&
		state.format === JOURNAL_FORMAT &&
		state.year === year &&
		fs.existsSync(path.join(dir, state.chain, 'base.json.gz'));

	let newChain = false;
	if (!chainOk) {
		let name = `chain-${today}`;
		for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `chain-${today}-${i}`;
		const base = baseSnapshot(client);
		fs.mkdirSync(path.join(dir, name), { recursive: true });
		writeAtomic(
			path.join(dir, name, 'base.json.gz'),
			zlib.gzipSync(JSON.stringify({ ...base, journalFormat: JOURNAL_FORMAT }))
		);
		state = { chain: name, year, format: JOURNAL_FORMAT, seq: base.seq };
		setSetting(STATE_KEY, state, db);
		newChain = true;
	}
	const s = state!;

	const lines = journalSince(client, s.seq);
	if (lines.length) {
		// append first, then record the position: a crash in between only repeats lines,
		// which the restore skips (it replays by seq)
		appendDurable(
			path.join(dir, s.chain, 'journal.jsonl'),
			lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
		);
		s.seq = lines[lines.length - 1].seq;
		setSetting(STATE_KEY, s, db);
	}
	db.delete(changeLog)
		.where(and(lte(changeLog.seq, s.seq), lt(changeLog.at, Date.now() - KEEP_IN_DB_MS)))
		.run();

	writeAtomic(
		path.join(dir, 'status.json'),
		JSON.stringify(
			{ lastRun: new Date().toISOString(), chain: s.chain, seq: s.seq, appended: lines.length },
			null,
			1
		) + '\n'
	);
	return { chain: s.chain, newChain, appended: lines.length };
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Run shortly after start and then once a day; does nothing without `BACKUP_DIR`. */
export function startBackupJob(dir: string | undefined) {
	if (!dir || timer) return;
	const run = () => {
		try {
			if (!fs.existsSync(dir)) {
				console.warn(`[backup] ${dir} doesn't exist — skipping`);
				return;
			}
			const r = runBackup(dir);
			console.log(
				`[backup] ${r.newChain ? `started ${r.chain}, ` : ''}${r.appended} change(s) appended`
			);
		} catch (e) {
			console.error('[backup] failed:', e);
		}
	};
	setTimeout(run, 30_000).unref();
	timer = setInterval(run, 24 * 3600_000);
	timer.unref();
}
