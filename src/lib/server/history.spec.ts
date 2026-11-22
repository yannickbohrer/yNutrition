import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type DB } from './db';
import { foods, logEntries } from './db/schema';
import { addEntry, deleteEntry, updateEntry } from './log';
import { createCustomFood, saveRecipe } from './customFoods';
import { setFavorite } from './foods/repo';
import { addWeight, deleteWeight, restoreWeight, weightsPage } from './weights';
import { insights } from './insights';
import { exportBackup, importBackup } from './backup';
import {
	BASELINE_DATE,
	getUserSettings,
	listTargetHistory,
	setTargetClock,
	targetPeriods,
	updateUserSettings
} from './settings';
import { runBackup } from './backupJob';
import { addDays } from '../dates';
// plain-JS restore used on the server
import { restoreChain } from '../../../scripts/restore.js';

let db: DB;
let bread: number;
let clock = '2026-03-01';

const targets = (kcal: number) => ({
	energy_kcal: kcal,
	protein: 100,
	carbs: 200,
	fat: 70,
	fiber: 30,
	extra: {}
});

beforeEach(() => {
	db = createTestDb();
	clock = '2026-03-01';
	setTargetClock(() => clock);
	bread = db
		.insert(foods)
		.values({
			source: 'swissfcd',
			sourceId: 'g:2',
			nameDe: 'Ruchbrot',
			nutrients: { energy_kcal: 240, protein: 8, carbs: 46, fat: 1.5 }
		})
		.returning()
		.get().id;
});
afterEach(() => setTargetClock(null));

describe('target history', () => {
	it('records nothing until targets change, then a baseline plus one row per day', () => {
		updateUserSettings({ lang: 'en' }, db);
		expect(listTargetHistory(db)).toHaveLength(0);
		const before = getUserSettings(db).targets.energy_kcal;
		clock = '2026-03-05';
		updateUserSettings({ targets: targets(1800) }, db);
		updateUserSettings({ targets: targets(1700) }, db); // same day: replaces
		let h = listTargetHistory(db);
		expect(h.map((r) => r.effectiveFrom)).toEqual([BASELINE_DATE, '2026-03-05']);
		expect(h[0].targets.energy_kcal).toBe(before);
		expect(h[1].targets.energy_kcal).toBe(1700);
		updateUserSettings({ targets: targets(1700) }, db); // unchanged: no write
		clock = '2026-04-01';
		updateUserSettings({ targets: targets(1600) }, db);
		h = listTargetHistory(db);
		expect(h).toHaveLength(3);
	});

	it('targetPeriods returns the period in effect on `from` plus changes inside the range', () => {
		expect(targetPeriods('2026-03-01', '2026-03-31', db)).toEqual([]);
		clock = '2026-03-05';
		updateUserSettings({ targets: targets(1800) }, db);
		clock = '2026-04-10';
		updateUserSettings({ targets: targets(1600) }, db);
		expect(targetPeriods('2026-03-01', '2026-03-31', db).map((p) => p.from)).toEqual([
			BASELINE_DATE,
			'2026-03-05'
		]);
		expect(targetPeriods('2026-03-10', '2026-04-30', db).map((p) => p.from)).toEqual([
			'2026-03-05',
			'2026-04-10'
		]);
		expect(targetPeriods('2026-05-01', '2026-05-31', db).map((p) => p.from)).toEqual([
			'2026-04-10'
		]);
	});

	it('insights compares against current targets by default and offers the historical view', () => {
		updateUserSettings({ targets: targets(1000) }, db, { recordHistory: false });
		// 2 days at 960 kcal (on target vs 1000), then target drops to 500 from Mar 4
		for (const d of ['2026-03-02', '2026-03-03', '2026-03-04'])
			addEntry({ foodId: bread, amount: 400, date: d, time: '12:00' }, 'de', db);
		clock = '2026-03-04';
		updateUserSettings({ targets: targets(500) }, db);
		const i = insights('2026-03-02', '2026-03-08', 'day', db);
		expect(i.hasTargetHistory).toBe(true);
		expect(i.targets.kcal).toBe(500);
		expect(i.overDays).toBe(3); // all over the current 500
		expect(i.historical.onTargetDays).toBe(2);
		expect(i.historical.overDays).toBe(1);
		expect(i.days.map((d) => d.targetThen)).toEqual([1000, 1000, 500, 500, 500, 500, 500]);
		expect(i.historical.targets.kcal).toBeCloseTo((1000 + 1000 + 500) / 3, 0);
		expect(i.firstDate).toBe('2026-03-02');
	});

	it('without any change both views agree', () => {
		addEntry({ foodId: bread, amount: 400, date: '2026-03-02', time: '12:00' }, 'de', db);
		const i = insights('2026-03-02', '2026-03-08', 'day', db);
		expect(i.hasTargetHistory).toBe(false);
		expect(i.historical.onTargetDays).toBe(i.onTargetDays);
		expect(i.historical.targets).toEqual(i.targets);
	});

	it('buckets a year by month with averages per logged day', () => {
		addEntry({ foodId: bread, amount: 100, date: '2026-01-05', time: '12:00' }, 'de', db); // 240
		addEntry({ foodId: bread, amount: 300, date: '2026-01-06', time: '12:00' }, 'de', db); // 720
		addEntry({ foodId: bread, amount: 100, date: '2026-03-01', time: '12:00' }, 'de', db);
		addWeight({ date: '2026-01-02', kg: 80 }, db);
		addWeight({ date: '2026-01-20', kg: 79 }, db);
		const i = insights('2026-01-01', '2026-12-31', 'month', db);
		expect(i.days).toHaveLength(12);
		expect(i.days[0]).toMatchObject({ date: '2026-01-01', kcal: 480, loggedDays: 2, weight: 79.5 });
		expect(i.days[1]).toMatchObject({ kcal: null, loggedDays: 0 });
		expect(i.loggedDays).toBe(3);
	});
});

describe('weights', () => {
	it('pages through every weigh-in without gaps or repeats', () => {
		let d = '2023-01-01';
		const n = 1205;
		for (let i = 0; i < n; i++) {
			addWeight({ date: d, kg: 70 + (i % 10) }, db);
			if (i % 3 !== 0) d = addDays(d, 1); // some days have two weigh-ins
		}
		const seen = new Set<number>();
		let page = weightsPage(null, 50, db);
		expect(page.total).toBe(n);
		expect(page.latest!.date).toBe(page.items[0].date);
		let prev = page.items[0];
		for (;;) {
			for (const w of page.items) {
				expect(seen.has(w.id)).toBe(false);
				expect(w.date <= prev.date).toBe(true);
				seen.add(w.id);
				prev = w;
			}
			if (!page.next) break;
			page = weightsPage(page.next, 50, db);
		}
		expect(seen.size).toBe(n);
		expect(prev.date).toBe('2023-01-01');
		expect(page.first!.date).toBe('2023-01-01');
	});

	it('restores a deleted weigh-in with its id', () => {
		const w = addWeight({ date: '2026-03-01', kg: 80.4, note: 'morgens' }, db);
		const row = deleteWeight(w.id, db)!;
		expect(weightsPage(null, 50, db).total).toBe(0);
		expect(restoreWeight(row, db)).toEqual(w);
		expect(deleteWeight(9999, db)).toBeNull();
	});
});

describe('backup format 2', () => {
	it('round-trips the target history and accepts version 1 files', () => {
		clock = '2026-03-05';
		updateUserSettings({ targets: targets(1800) }, db);
		const json = JSON.parse(JSON.stringify(exportBackup(db)));
		expect(json.version).toBe(2);
		expect(json.targetHistory).toHaveLength(2);
		const db2 = createTestDb();
		clock = '2026-11-22';
		importBackup(json, db2);
		// importing doesn't count as a new change made today
		expect(listTargetHistory(db2).map((r) => r.effectiveFrom)).toEqual([
			BASELINE_DATE,
			'2026-03-05'
		]);
		expect(getUserSettings(db2).targets.energy_kcal).toBe(1800);
		const v1 = { ...json, version: 1 };
		delete v1.targetHistory;
		importBackup(v1, db2);
		expect(listTargetHistory(db2)).toHaveLength(0);
	});
});

describe('incremental backups', () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nutrition-backup-'));
	});
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

	const comparable = (b: ReturnType<typeof exportBackup>) => ({
		entries: b.entries.map((e) => ({ ...e, createdAt: 0 })),
		weights: b.weights.map((w) => ({ ...w, createdAt: 0 })),
		recipes: b.recipes,
		favorites: [...b.favorites].sort(),
		targets: b.settings.targets,
		history: (b.targetHistory ?? []).map((h) => [h.effectiveFrom, h.targets]),
		portions: b.portions.map((p) => [p.food, p.labelDe, p.amount])
	});

	it('appends only changes and restores to the same data', () => {
		addEntry({ foodId: bread, amount: 100, date: '2026-03-01', time: '08:00' }, 'de', db);
		const r1 = runBackup(dir, db, '2026-03-01');
		expect(r1.newChain).toBe(true);
		expect(r1.appended).toBe(0); // the base already holds it

		// nothing changed: nothing appended
		const r2 = runBackup(dir, db, '2026-03-02');
		expect(r2).toMatchObject({ newChain: false, appended: 0 });
		expect(fs.existsSync(path.join(dir, r1.chain, 'journal.jsonl'))).toBe(false);

		const c = createCustomFood(
			{
				name: 'Müsli',
				nutrients: { energy_kcal: 380 },
				portions: [{ label: 'Schale', amount: 60 }]
			},
			db
		);
		const r = saveRecipe(
			{
				name: 'Bowl',
				servings: 2,
				items: [
					{ foodId: c, amount: 120 },
					{ foodId: bread, amount: 50 }
				]
			},
			null,
			db
		);
		setFavorite(c, true, db);
		const e = addEntry({ foodId: r, amount: 110, date: '2026-03-02', time: '07:00' }, 'de', db);
		const gone = addEntry(
			{ foodId: bread, amount: 50, date: '2026-03-02', time: '09:00' },
			'de',
			db
		);
		updateEntry(e.id, { amount: 130 }, db);
		deleteEntry(gone.id, db);
		addWeight({ date: '2026-03-02', kg: 80.5, note: 'morgens' }, db);
		clock = '2026-03-02';
		updateUserSettings({ targets: targets(1900) }, db);

		const r3 = runBackup(dir, db, '2026-03-02');
		expect(r3.appended).toBeGreaterThan(5);
		const size = fs.statSync(path.join(dir, r1.chain, 'journal.jsonl')).size;
		expect(runBackup(dir, db, '2026-03-03').appended).toBe(0);
		expect(fs.statSync(path.join(dir, r1.chain, 'journal.jsonl')).size).toBe(size);

		const restored = restoreChain(dir, undefined).backup;
		const db2 = createTestDb();
		db2
			.insert(foods)
			.values({
				source: 'swissfcd',
				sourceId: 'g:2',
				nameDe: 'Ruchbrot',
				nutrients: { energy_kcal: 240 }
			})
			.run();
		importBackup(JSON.parse(JSON.stringify(restored)), db2);
		expect(comparable(exportBackup(db2))).toEqual(comparable(exportBackup(db)));
		expect(db2.select().from(logEntries).all()).toHaveLength(2);
	});

	it('starts a new chain each year and when the database lost its position', () => {
		const a = runBackup(dir, db, '2026-12-31');
		const b = runBackup(dir, db, '2027-01-01');
		expect(b.newChain).toBe(true);
		expect(b.chain).not.toBe(a.chain);
		const fresh = createTestDb();
		const c = runBackup(dir, fresh, '2027-01-01');
		expect(c.newChain).toBe(true);
		expect(c.chain).toBe('chain-2027-01-01-2');
		expect(restoreChain(dir, undefined).chain).toBe('chain-2027-01-01-2');
	});

	it('restores a torn journal (duplicate and broken lines)', () => {
		runBackup(dir, db, '2026-03-01');
		addWeight({ date: '2026-03-02', kg: 80 }, db);
		const r = runBackup(dir, db, '2026-03-02');
		const jf = path.join(dir, r.chain, 'journal.jsonl');
		const body = fs.readFileSync(jf, 'utf8');
		fs.appendFileSync(jf, body + '{"seq": 99, "tb');
		expect(restoreChain(dir, undefined).backup.weights).toHaveLength(1);
	});
});
