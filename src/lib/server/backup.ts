/** Full JSON backup (export/import) and CSV exports. Passkeys/sessions are never exported. */
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { getDb, type DB } from './db';
import {
	favorites,
	foodPortions,
	foods,
	logEntries,
	recipeItems,
	recipes,
	searchCache,
	weights,
	type FoodRow
} from './db/schema';
import { NUTRIENT_KEYS, sanitizeNutrients, isNutrientKey, type NutrientKey } from '../nutrients';
import { scaleNutrients } from '../nutrition';
import { getUserSettings, updateUserSettings } from './settings';
import type { UserSettings } from '../types';
import { isDate, isTime } from '../dates';
import { ValidationError } from './log';

export const BACKUP_VERSION = 1;

type Ref = string;
const ref = (f: Pick<FoodRow, 'source' | 'sourceId'>): Ref => `${f.source}:${f.sourceId}`;

export interface BackupFood {
	ref: Ref;
	source: FoodRow['source'];
	sourceId: string;
	nameDe: string | null;
	nameEn: string | null;
	synonyms: string | null;
	brand: string | null;
	barcode: string | null;
	category: string | null;
	basis: 'g' | 'ml';
	density: number | null;
	nutrients: Record<string, number>;
	partial: string[] | null;
	servingSize: string | null;
	servingQuantity: number | null;
	deletedAt: number | null;
}

export interface Backup {
	app: 'nutrition';
	version: number;
	exportedAt: string;
	settings: UserSettings;
	foods: BackupFood[];
	portions: { food: Ref; labelDe: string; labelEn: string | null; amount: number; sort: number }[];
	recipes: {
		food: Ref;
		servings: number;
		cookedWeight: number | null;
		notes: string | null;
		items: { food: Ref; amount: number; sort: number }[];
	}[];
	favorites: Ref[];
	entries: {
		date: string;
		time: string;
		food: Ref | null;
		foodName: string;
		foodBrand: string | null;
		basis: 'g' | 'ml';
		amount: number;
		per100: Record<string, number>;
		partial: string[] | null;
		createdAt: number;
	}[];
	weights: { date: string; kg: number; note: string | null; createdAt: number }[];
}

export function exportBackup(db: DB = getDb()): Backup {
	const entries = db
		.select()
		.from(logEntries)
		.orderBy(asc(logEntries.date), asc(logEntries.time))
		.all();
	const items = db.select().from(recipeItems).all();
	const portions = db.select().from(foodPortions).all();
	const favs = db.select().from(favorites).all();
	// every non-Swiss food + Swiss foods that are referenced
	const referenced = new Set<number>([
		...entries.map((e) => e.foodId).filter((x): x is number => x !== null),
		...items.map((i) => i.foodId),
		...portions.map((p) => p.foodId),
		...favs.map((f) => f.foodId)
	]);
	const own = db.select().from(foods).where(ne(foods.source, 'swissfcd')).all();
	const swiss = referenced.size
		? db
				.select()
				.from(foods)
				.where(inArray(foods.id, [...referenced]))
				.all()
				.filter((f) => f.source === 'swissfcd')
		: [];
	const all = [...own, ...swiss];
	const byId = new Map(all.map((f) => [f.id, f]));
	const r = (id: number | null) => (id !== null && byId.has(id) ? ref(byId.get(id)!) : null);
	return {
		app: 'nutrition',
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		settings: getUserSettings(db),
		foods: all.map((f) => ({
			ref: ref(f),
			source: f.source,
			sourceId: f.sourceId,
			nameDe: f.nameDe,
			nameEn: f.nameEn,
			synonyms: f.synonyms,
			brand: f.brand,
			barcode: f.barcode,
			category: f.category,
			basis: f.basis,
			density: f.density,
			nutrients: f.nutrients as Record<string, number>,
			partial: f.partial,
			servingSize: f.servingSize,
			servingQuantity: f.servingQuantity,
			deletedAt: f.deletedAt
		})),
		portions: portions
			.filter((p) => byId.has(p.foodId))
			.map((p) => ({
				food: r(p.foodId)!,
				labelDe: p.labelDe,
				labelEn: p.labelEn,
				amount: p.amount,
				sort: p.sort
			})),
		recipes: db
			.select()
			.from(recipes)
			.all()
			.filter((x) => byId.has(x.foodId))
			.map((x) => ({
				food: r(x.foodId)!,
				servings: x.servings,
				cookedWeight: x.cookedWeight,
				notes: x.notes,
				items: items
					.filter((i) => i.recipeId === x.foodId && byId.has(i.foodId))
					.map((i) => ({ food: r(i.foodId)!, amount: i.amount, sort: i.sort }))
			})),
		favorites: favs.map((f) => r(f.foodId)).filter((x): x is Ref => x !== null),
		entries: entries.map((e) => ({
			date: e.date,
			time: e.time,
			food: r(e.foodId),
			foodName: e.foodName,
			foodBrand: e.foodBrand,
			basis: e.basis,
			amount: e.amount,
			per100: e.per100 as Record<string, number>,
			partial: e.partial,
			createdAt: e.createdAt
		})),
		weights: db
			.select()
			.from(weights)
			.orderBy(asc(weights.date))
			.all()
			.map((w) => ({ date: w.date, kg: w.kg, note: w.note, createdAt: w.createdAt }))
	};
}

const SOURCES = new Set(['swissfcd', 'off', 'usda', 'custom', 'recipe']);
const partialKeys = (p: unknown): NutrientKey[] | null =>
	Array.isArray(p)
		? p.filter((k): k is NutrientKey => typeof k === 'string' && isNutrientKey(k))
		: null;
const num = (v: unknown, min: number, max: number) => {
	const n = Number(v);
	if (!Number.isFinite(n) || n < min || n > max)
		throw new ValidationError('invalid number in backup');
	return n;
};
const optStr = (v: unknown, max = 500) =>
	typeof v === 'string' && v.trim() ? v.slice(0, max) : null;

/** Replace all user data with the backup contents (Swiss reference data is kept). */
export function importBackup(input: unknown, db: DB = getDb()) {
	const b = input as Partial<Backup>;
	if (!b || b.app !== 'nutrition' || typeof b.version !== 'number')
		throw new ValidationError('not a Nutrition backup');
	if (b.version > BACKUP_VERSION) throw new ValidationError('backup from a newer version');
	for (const k of ['foods', 'portions', 'recipes', 'favorites', 'entries', 'weights'] as const)
		if (!Array.isArray(b[k])) throw new ValidationError(`backup.${k} missing`);

	const counts = db.transaction((tx) => {
		tx.delete(logEntries).run();
		tx.delete(weights).run();
		tx.delete(favorites).run();
		tx.delete(recipeItems).run();
		tx.delete(recipes).run();
		tx.delete(foodPortions).run();
		tx.delete(searchCache).run();
		tx.delete(foods)
			.where(inArray(foods.source, ['custom', 'recipe']))
			.run();

		const ids = new Map<Ref, number>();
		for (const f of b.foods!) {
			if (!SOURCES.has(f.source) || typeof f.sourceId !== 'string')
				throw new ValidationError('invalid food');
			const values = {
				source: f.source,
				sourceId: f.sourceId,
				nameDe: optStr(f.nameDe),
				nameEn: optStr(f.nameEn),
				synonyms: optStr(f.synonyms),
				brand: optStr(f.brand),
				barcode: optStr(f.barcode, 20),
				category: optStr(f.category),
				basis: f.basis === 'ml' ? ('ml' as const) : ('g' as const),
				density: typeof f.density === 'number' ? f.density : null,
				nutrients: sanitizeNutrients(f.nutrients),
				partial: partialKeys(f.partial),
				servingSize: optStr(f.servingSize, 100),
				servingQuantity: typeof f.servingQuantity === 'number' ? f.servingQuantity : null,
				deletedAt: typeof f.deletedAt === 'number' ? f.deletedAt : null
			};
			if (f.source === 'swissfcd') {
				// keep the current reference data; just map the id
				const row = tx
					.select({ id: foods.id })
					.from(foods)
					.where(and(eq(foods.source, 'swissfcd'), eq(foods.sourceId, f.sourceId)))
					.get();
				if (row) {
					ids.set(f.ref, row.id);
					continue;
				}
			}
			const row = tx
				.insert(foods)
				.values(values)
				.onConflictDoUpdate({ target: [foods.source, foods.sourceId], set: values })
				.returning({ id: foods.id })
				.get();
			ids.set(f.ref, row.id);
		}
		const id = (r: unknown) => (typeof r === 'string' ? ids.get(r) : undefined);

		for (const p of b.portions!) {
			const fid = id(p.food);
			if (fid === undefined) continue;
			tx.insert(foodPortions)
				.values({
					foodId: fid,
					labelDe: String(p.labelDe).slice(0, 60),
					labelEn: optStr(p.labelEn, 60),
					amount: num(p.amount, 0.1, 20000),
					sort: Number(p.sort) || 0
				})
				.run();
		}
		for (const r of b.recipes!) {
			const fid = id(r.food);
			if (fid === undefined) continue;
			tx.insert(recipes)
				.values({
					foodId: fid,
					servings: num(r.servings, 0.01, 1000),
					cookedWeight: r.cookedWeight ? num(r.cookedWeight, 0.1, 100000) : null,
					notes: optStr(r.notes, 2000)
				})
				.run();
			for (const it of r.items ?? []) {
				const iid = id(it.food);
				if (iid === undefined) continue;
				tx.insert(recipeItems)
					.values({
						recipeId: fid,
						foodId: iid,
						amount: num(it.amount, 0.1, 20000),
						sort: Number(it.sort) || 0
					})
					.run();
			}
		}
		for (const f of b.favorites!) {
			const fid = id(f);
			if (fid !== undefined)
				tx.insert(favorites).values({ foodId: fid }).onConflictDoNothing().run();
		}
		let entries = 0;
		for (const e of b.entries!) {
			if (!isDate(e.date) || !isTime(e.time)) throw new ValidationError('invalid entry date/time');
			tx.insert(logEntries)
				.values({
					date: e.date,
					time: e.time,
					foodId: id(e.food) ?? null,
					foodName: String(e.foodName ?? '?').slice(0, 300),
					foodBrand: optStr(e.foodBrand, 100),
					basis: e.basis === 'ml' ? 'ml' : 'g',
					amount: num(e.amount, 0.1, 20000),
					per100: sanitizeNutrients(e.per100),
					partial: partialKeys(e.partial),
					createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now()
				})
				.run();
			entries++;
		}
		let ws = 0;
		for (const w of b.weights!) {
			if (!isDate(w.date)) throw new ValidationError('invalid weight date');
			tx.insert(weights)
				.values({
					date: w.date,
					kg: num(w.kg, 20, 400),
					note: optStr(w.note, 300),
					createdAt: typeof w.createdAt === 'number' ? w.createdAt : Date.now()
				})
				.run();
			ws++;
		}
		return { foods: ids.size, entries, weights: ws, recipes: b.recipes!.length };
	});
	if (b.settings) updateUserSettings(b.settings, db);
	return counts;
}

function csvCell(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
	return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

export function entriesCsv(db: DB = getDb()): string {
	const rows = db
		.select()
		.from(logEntries)
		.orderBy(asc(logEntries.date), asc(logEntries.time))
		.all();
	const keys = NUTRIENT_KEYS;
	const lines = [csvRow(['date', 'time', 'food', 'brand', 'amount', 'unit', ...keys])];
	for (const r of rows) {
		const n = scaleNutrients(r.per100, r.amount);
		lines.push(
			csvRow([r.date, r.time, r.foodName, r.foodBrand, r.amount, r.basis, ...keys.map((k) => n[k])])
		);
	}
	return lines.join('\n') + '\n';
}

export function weightsCsv(db: DB = getDb()): string {
	const rows = db.select().from(weights).orderBy(asc(weights.date)).all();
	return (
		[csvRow(['date', 'kg', 'note']), ...rows.map((w) => csvRow([w.date, w.kg, w.note]))].join(
			'\n'
		) + '\n'
	);
}
