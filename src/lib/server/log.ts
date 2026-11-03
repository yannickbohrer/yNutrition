/** Log entries (food diary). */
import { and, asc, between, eq, inArray } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { foods, logEntries, type LogEntryRow } from './db/schema';
import { aggregate, scaleNutrients } from '../nutrition';
import type { DaySummary, EntryDTO, Lang } from '../types';
import { foodName, getFoodRow } from './foods/repo';
import { isDate, isTime } from '../dates';

export class ValidationError extends Error {
	status = 400;
}

export function validAmount(a: unknown): number {
	const n = Number(a);
	if (!Number.isFinite(n) || n <= 0 || n > 20000) throw new ValidationError('invalid amount');
	return Math.round(n * 10) / 10;
}

export function toEntryDTO(r: LogEntryRow, source: EntryDTO['source'] = null): EntryDTO {
	return {
		id: r.id,
		date: r.date,
		time: r.time,
		foodId: r.foodId,
		name: r.foodName,
		brand: r.foodBrand,
		basis: r.basis,
		amount: r.amount,
		per100: r.per100,
		nutrients: scaleNutrients(r.per100, r.amount),
		partial: r.partial ?? [],
		source
	};
}

function withSources(rows: LogEntryRow[], db: DB): EntryDTO[] {
	const ids = [...new Set(rows.map((r) => r.foodId).filter((x): x is number => x !== null))];
	const src = new Map<number, EntryDTO['source']>();
	if (ids.length) {
		for (const f of db
			.select({ id: foods.id, source: foods.source })
			.from(foods)
			.where(inArray(foods.id, ids))
			.all())
			src.set(f.id, f.source);
	}
	return rows.map((r) => toEntryDTO(r, r.foodId !== null ? (src.get(r.foodId) ?? null) : null));
}

export function entriesBetween(from: string, to: string, db: DB = getDb()): EntryDTO[] {
	const rows = db
		.select()
		.from(logEntries)
		.where(between(logEntries.date, from, to))
		.orderBy(asc(logEntries.date), asc(logEntries.time), asc(logEntries.id))
		.all();
	return withSources(rows, db);
}

export function getDay(date: string, db: DB = getDb()): DaySummary {
	const entries = entriesBetween(date, date, db);
	const agg = aggregate(entries.map((e) => ({ nutrients: e.nutrients, partial: e.partial })));
	return { date, entries, totals: agg.totals, missing: agg.missing, count: agg.count };
}

export function getEntry(id: number, db: DB = getDb()): EntryDTO | null {
	const r = db.select().from(logEntries).where(eq(logEntries.id, id)).get();
	return r ? withSources([r], db)[0] : null;
}

export interface NewEntryInput {
	foodId: number;
	amount: number;
	date: string;
	time: string;
}

export function addEntry(input: NewEntryInput, lang: Lang, db: DB = getDb()): EntryDTO {
	if (!isDate(input.date) || !isTime(input.time)) throw new ValidationError('invalid date/time');
	const amount = validAmount(input.amount);
	const food = getFoodRow(input.foodId, db);
	if (!food) throw new ValidationError('unknown food');
	const row = db
		.insert(logEntries)
		.values({
			date: input.date,
			time: input.time,
			foodId: food.id,
			foodName: foodName(food, lang),
			foodBrand: food.brand,
			basis: food.basis,
			amount,
			per100: food.nutrients ?? {},
			partial: food.partial ?? null,
			createdAt: Date.now()
		})
		.returning()
		.get();
	return withSources([row], db)[0];
}

export function updateEntry(
	id: number,
	patch: { amount?: number; date?: string; time?: string },
	db: DB = getDb()
): EntryDTO | null {
	const set: Partial<LogEntryRow> = {};
	if (patch.amount !== undefined) set.amount = validAmount(patch.amount);
	if (patch.date !== undefined) {
		if (!isDate(patch.date)) throw new ValidationError('invalid date');
		set.date = patch.date;
	}
	if (patch.time !== undefined) {
		if (!isTime(patch.time)) throw new ValidationError('invalid time');
		set.time = patch.time;
	}
	if (Object.keys(set).length) db.update(logEntries).set(set).where(eq(logEntries.id, id)).run();
	return getEntry(id, db);
}

/** Delete and return the raw row so the client can undo. */
export function deleteEntry(id: number, db: DB = getDb()): LogEntryRow | null {
	const r = db.select().from(logEntries).where(eq(logEntries.id, id)).get();
	if (!r) return null;
	db.delete(logEntries).where(eq(logEntries.id, id)).run();
	return r;
}

/** Undo a deletion: re-insert the row with its original id. */
export function restoreEntry(row: LogEntryRow, db: DB = getDb()): EntryDTO {
	if (!isDate(row.date) || !isTime(row.time)) throw new ValidationError('invalid entry');
	const foodId = row.foodId !== null && getFoodRow(row.foodId, db) ? row.foodId : null;
	const r = db
		.insert(logEntries)
		.values({
			id: row.id,
			date: row.date,
			time: row.time,
			foodId,
			foodName: String(row.foodName).slice(0, 300),
			foodBrand: row.foodBrand,
			basis: row.basis === 'ml' ? 'ml' : 'g',
			amount: validAmount(row.amount),
			per100: row.per100 ?? {},
			partial: row.partial ?? null,
			createdAt: row.createdAt ?? Date.now()
		})
		.onConflictDoNothing()
		.returning()
		.get();
	return withSources(
		[r ?? db.select().from(logEntries).where(eq(logEntries.id, row.id)).get()!],
		db
	)[0];
}

/** Copy entries to another day (keeping their time unless `time` is given). */
export function copyEntries(
	ids: number[],
	date: string,
	time: string | null,
	db: DB = getDb()
): EntryDTO[] {
	if (!isDate(date)) throw new ValidationError('invalid date');
	if (time !== null && !isTime(time)) throw new ValidationError('invalid time');
	if (!ids.length || ids.length > 200) throw new ValidationError('invalid ids');
	const rows = db
		.select()
		.from(logEntries)
		.where(inArray(logEntries.id, ids))
		.orderBy(asc(logEntries.time))
		.all();
	const now = Date.now();
	const created = db.transaction((tx) =>
		rows.map((r, i) =>
			tx
				.insert(logEntries)
				.values({
					date,
					time: time ?? r.time,
					foodId: r.foodId,
					foodName: r.foodName,
					foodBrand: r.foodBrand,
					basis: r.basis,
					amount: r.amount,
					per100: r.per100,
					partial: r.partial,
					createdAt: now + i
				})
				.returning()
				.get()
		)
	);
	return withSources(created, db);
}

export function entriesForFood(foodId: number, db: DB = getDb()) {
	return db
		.select()
		.from(logEntries)
		.where(and(eq(logEntries.foodId, foodId)))
		.all();
}
