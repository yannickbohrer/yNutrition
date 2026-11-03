import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type DB } from './db';
import { foods } from './db/schema';
import { addEntry, copyEntries, deleteEntry, getDay, restoreEntry, updateEntry } from './log';
import {
	createCustomFood,
	deleteFood,
	getRecipe,
	saveRecipe,
	updateCustomFood
} from './customFoods';
import { getFoodDTO, setFavorite } from './foods/repo';
import { addWeight, listWeights } from './weights';
import { breakdown, insights } from './insights';
import { entriesCsv, exportBackup, importBackup, weightsCsv } from './backup';
import { updateUserSettings, getUserSettings } from './settings';
import { addDays, endOfMonth, startOfWeek, todayLocal } from '../dates';

let db: DB;
let apple: number;
let bread: number;

beforeEach(() => {
	db = createTestDb();
	apple = db
		.insert(foods)
		.values({
			source: 'swissfcd',
			sourceId: 'g:1',
			nameDe: 'Apfel, roh',
			nameEn: 'Apple, raw',
			nutrients: { energy_kcal: 52, protein: 0.3, carbs: 12, fat: 0.2, fiber: 2.4 }
		})
		.returning()
		.get().id;
	bread = db
		.insert(foods)
		.values({
			source: 'swissfcd',
			sourceId: 'g:2',
			nameDe: 'Ruchbrot',
			nameEn: 'Brown bread',
			nutrients: { energy_kcal: 240, protein: 8, carbs: 46, fat: 1.5 }
		})
		.returning()
		.get().id;
});

describe('log entries', () => {
	it('adds, totals, edits, deletes and restores', () => {
		const e = addEntry({ foodId: apple, amount: 150, date: '2026-03-01', time: '08:15' }, 'de', db);
		expect(e.name).toBe('Apfel, roh');
		expect(e.nutrients.energy_kcal).toBe(78);
		addEntry({ foodId: bread, amount: 80, date: '2026-03-01', time: '07:30' }, 'de', db);
		let day = getDay('2026-03-01', db);
		expect(day.entries.map((x) => x.time)).toEqual(['07:30', '08:15']);
		expect(day.totals.energy_kcal).toBe(78 + 192);
		expect(day.missing.fiber).toBe(1);
		updateEntry(e.id, { amount: 200, time: '09:00' }, db);
		expect(getDay('2026-03-01', db).totals.energy_kcal).toBe(104 + 192);
		const removed = deleteEntry(e.id, db)!;
		expect(getDay('2026-03-01', db).count).toBe(1);
		restoreEntry(removed, db);
		day = getDay('2026-03-01', db);
		expect(day.count).toBe(2);
		expect(day.entries.find((x) => x.id === e.id)?.amount).toBe(200);
	});
	it('snapshot keeps history stable when a custom food changes', () => {
		const id = createCustomFood({ name: 'Riegel', nutrients: { energy_kcal: 400 } }, db);
		addEntry({ foodId: id, amount: 50, date: '2026-03-01', time: '10:00' }, 'de', db);
		updateCustomFood(id, { name: 'Riegel', nutrients: { energy_kcal: 500 } }, db);
		expect(getDay('2026-03-01', db).totals.energy_kcal).toBe(200);
	});
	it('copies entries to another day', () => {
		const a = addEntry({ foodId: apple, amount: 100, date: '2026-03-01', time: '08:00' }, 'de', db);
		const b = addEntry({ foodId: bread, amount: 50, date: '2026-03-01', time: '08:05' }, 'de', db);
		const copied = copyEntries([a.id, b.id], '2026-03-02', null, db);
		expect(copied.map((c) => c.time)).toEqual(['08:00', '08:05']);
		expect(getDay('2026-03-02', db).count).toBe(2);
		copyEntries([a.id], '2026-03-02', '12:00', db);
		expect(getDay('2026-03-02', db).entries.at(-1)?.time).toBe('12:00');
	});
	it('validates input', () => {
		expect(() =>
			addEntry({ foodId: apple, amount: -1, date: '2026-03-01', time: '08:00' }, 'de', db)
		).toThrow();
		expect(() =>
			addEntry({ foodId: apple, amount: 1, date: '2026-02-30', time: '08:00' }, 'de', db)
		).toThrow();
		expect(() =>
			addEntry({ foodId: apple, amount: 1, date: '2026-02-03', time: '25:00' }, 'de', db)
		).toThrow();
		expect(() =>
			addEntry({ foodId: 9999, amount: 1, date: '2026-02-03', time: '08:00' }, 'de', db)
		).toThrow();
	});
});

describe('custom foods & recipes', () => {
	it('custom food per serving is converted to per 100 g; portions; barcode', () => {
		const id = createCustomFood(
			{
				name: 'Proteinriegel',
				barcode: '7610000000001',
				per: 'serving',
				servingAmount: 50,
				servingLabel: '1 Riegel',
				nutrients: { energy_kcal: 200, protein: 20 },
				portions: [{ label: '1 Riegel', amount: 50 }]
			},
			db
		);
		const f = getFoodDTO(id, 'de', db)!;
		expect(f.nutrients.energy_kcal).toBe(400);
		expect(f.nutrients.protein).toBe(40);
		expect(f.barcode).toBe('7610000000001');
		expect(f.portions.find((p) => p.kind === 'user')?.amount).toBe(50);
		expect(f.editable).toBe(true);
		expect(f.incomplete).toBe(true); // carbs/fat unknown
	});
	it('recipe nutrition per 100 g and per serving, used via portion picker presets', () => {
		const id = saveRecipe(
			{
				name: 'Apfel-Brot',
				servings: 2,
				cookedWeight: null,
				items: [
					{ foodId: apple, amount: 200 },
					{ foodId: bread, amount: 100 }
				]
			},
			null,
			db
		);
		const r = getRecipe(id, 'de', db)!;
		expect(r.total.energy_kcal).toBe(104 + 240);
		expect(r.perServing.energy_kcal).toBe(172);
		expect(r.per100.energy_kcal).toBeCloseTo(114.6667, 3);
		expect(r.partial).toContain('fiber');
		const dto = getFoodDTO(id, 'de', db)!;
		expect(dto.portions.find((p) => p.default)).toMatchObject({ amount: 150, label: '1 Portion' });
		expect(dto.portions.map((p) => p.amount)).toContain(75);
		const e = addEntry({ foodId: id, amount: 150, date: '2026-03-01', time: '12:00' }, 'de', db);
		expect(e.nutrients.energy_kcal).toBeCloseTo(172, 1);
		expect(e.partial).toContain('fiber');
	});
	it('recipes update when an ingredient custom food changes; cycles are refused', () => {
		const c = createCustomFood(
			{ name: 'Sauce', nutrients: { energy_kcal: 100, protein: 1, carbs: 1, fat: 1 } },
			db
		);
		const inner = saveRecipe(
			{ name: 'Inner', servings: 1, items: [{ foodId: c, amount: 100 }] },
			null,
			db
		);
		const outer = saveRecipe(
			{ name: 'Outer', servings: 1, items: [{ foodId: inner, amount: 100 }] },
			null,
			db
		);
		updateCustomFood(
			c,
			{ name: 'Sauce', nutrients: { energy_kcal: 300, protein: 1, carbs: 1, fat: 1 } },
			db
		);
		expect(getRecipe(outer, 'de', db)!.per100.energy_kcal).toBe(300);
		expect(() =>
			saveRecipe({ name: 'Inner', servings: 1, items: [{ foodId: outer, amount: 10 }] }, inner, db)
		).toThrow(/cycle/);
	});
	it('deleted foods disappear from search but keep log history', () => {
		const id = createCustomFood({ name: 'Weg', nutrients: { energy_kcal: 1 } }, db);
		addEntry({ foodId: id, amount: 10, date: '2026-03-01', time: '10:00' }, 'de', db);
		deleteFood(id, db);
		expect(getFoodDTO(id, 'de', db)!.deleted).toBe(true);
		expect(getDay('2026-03-01', db).count).toBe(1);
		expect(() => deleteFood(apple, db)).toThrow();
	});
});

describe('insights', () => {
	it('computes daily series, averages and adherence', () => {
		updateUserSettings(
			{ targets: { energy_kcal: 100, protein: 10, carbs: 10, fat: 10, extra: {} } },
			db
		);
		addEntry({ foodId: bread, amount: 40, date: '2026-03-02', time: '08:00' }, 'de', db); // 96 kcal → on target
		addEntry({ foodId: bread, amount: 100, date: '2026-03-03', time: '08:00' }, 'de', db); // 240 → over
		addWeight({ date: '2026-03-02', kg: 80 }, db);
		addWeight({ date: '2026-03-04', kg: 79 }, db);
		const i = insights('2026-03-02', '2026-03-08', db);
		expect(i.days).toHaveLength(7);
		expect(i.loggedDays).toBe(2);
		expect(i.avg.kcal).toBe(168);
		expect(i.onTargetDays).toBe(1);
		expect(i.overDays).toBe(1);
		expect(i.days[0].weight).toBe(80);
		expect(i.weightTrend.map((w) => w.value)).toEqual([80, 79.5]);
		const b = breakdown('2026-03-01', '2026-03-31', 'energy_kcal', db);
		expect(b.items[0]).toMatchObject({ label: 'Ruchbrot', share: 100 });
	});
});

describe('backup', () => {
	it('round-trips all user data', () => {
		updateUserSettings(
			{
				lang: 'en',
				targets: {
					energy_kcal: 1800,
					protein: 120,
					carbs: 180,
					fat: 60,
					extra: { sugars: { max: 50 } }
				}
			},
			db
		);
		const c = createCustomFood(
			{
				name: 'Müsli "Eigenmischung"',
				barcode: '123',
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
					{ foodId: apple, amount: 100 }
				]
			},
			null,
			db
		);
		setFavorite(c, true, db);
		addEntry({ foodId: r, amount: 110, date: '2026-03-01', time: '07:00' }, 'de', db);
		addEntry({ foodId: apple, amount: 120, date: '2026-03-01', time: '10:00' }, 'de', db);
		addWeight({ date: '2026-03-01', kg: 81.2, note: 'morgens' }, db);
		const backup = exportBackup(db);
		const json = JSON.parse(JSON.stringify(backup));
		expect(json.foods.some((f: { ref: string }) => f.ref === 'swissfcd:g:1')).toBe(true);

		const db2 = createTestDb();
		db2
			.insert(foods)
			.values({
				source: 'swissfcd',
				sourceId: 'g:1',
				nameDe: 'Apfel, roh',
				nutrients: { energy_kcal: 52 }
			})
			.run();
		const counts = importBackup(json, db2);
		expect(counts).toMatchObject({ entries: 2, weights: 1, recipes: 1 });
		expect(getDay('2026-03-01', db2).totals.energy_kcal).toBeCloseTo(
			getDay('2026-03-01', db).totals.energy_kcal!,
			5
		);
		expect(listWeights(10, db2)[0]).toMatchObject({ kg: 81.2, note: 'morgens' });
		expect(getUserSettings(db2).targets.extra.sugars?.max).toBe(50);
		expect(getUserSettings(db2).lang).toBe('en');
		const again = exportBackup(db2);
		expect(again.entries).toHaveLength(2);
		expect(again.favorites).toHaveLength(1);
		expect(again.recipes[0].items).toHaveLength(2);
		// importing twice is idempotent (replace semantics)
		importBackup(json, db2);
		expect(getDay('2026-03-01', db2).count).toBe(2);
	});
	it('rejects foreign files', () => {
		expect(() => importBackup({ foo: 1 }, db)).toThrow();
		expect(() => importBackup({ app: 'nutrition', version: 99 }, db)).toThrow();
	});
	it('CSV exports escape properly', () => {
		const c = createCustomFood({ name: 'A, "B"', nutrients: { energy_kcal: 100 } }, db);
		addEntry({ foodId: c, amount: 50, date: '2026-03-01', time: '07:00' }, 'de', db);
		addWeight({ date: '2026-03-01', kg: 80 }, db);
		const csv = entriesCsv(db);
		expect(csv.split('\n')[0]).toMatch(/^date,time,food,brand,amount,unit,energy_kcal/);
		expect(csv).toContain('"A, ""B"""');
		expect(weightsCsv(db)).toBe('date,kg,note\n2026-03-01,80,\n');
	});
});

describe('dates', () => {
	it('local date in Zurich and helpers', () => {
		// 2026-03-28T23:30Z is 00:30 on 29th in Zurich (UTC+1)
		expect(todayLocal('Europe/Zurich', new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29');
		// DST switch day: 2026-03-29 22:30Z = 00:30 on 30th (UTC+2)
		expect(todayLocal('Europe/Zurich', new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30');
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
		expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
		expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
	});
});
