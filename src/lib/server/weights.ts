import { and, asc, between, desc, eq, lt, or, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { weights } from './db/schema';
import type { WeightDTO } from '../types';
import { isDate } from '../dates';
import { ValidationError } from './log';

const toDTO = (r: typeof weights.$inferSelect): WeightDTO => ({
	id: r.id,
	date: r.date,
	kg: r.kg,
	note: r.note
});

function validKg(v: unknown): number {
	const n = Number(v);
	if (!Number.isFinite(n) || n < 20 || n > 400) throw new ValidationError('invalid weight');
	return Math.round(n * 100) / 100;
}

export function listWeights(limit = 1000, db: DB = getDb()): WeightDTO[] {
	return db
		.select()
		.from(weights)
		.orderBy(desc(weights.date), desc(weights.id))
		.limit(limit)
		.all()
		.map(toDTO);
}

export interface WeightCursor {
	date: string;
	id: number;
}

export interface WeightPage {
	items: WeightDTO[];
	/** all weigh-ins ever recorded */
	total: number;
	/** cursor for the next (older) page; null on the last one */
	next: WeightCursor | null;
	/** first and last weigh-in overall (for the "Alle" range and the latest value) */
	first: WeightDTO | null;
	latest: WeightDTO | null;
}

/**
 * Newest-first page of weigh-ins strictly older than `cursor` (keyset pagination over
 * (date, id), so pages never skip or repeat rows while new ones are added).
 */
export function weightsPage(cursor: WeightCursor | null, limit = 50, db: DB = getDb()): WeightPage {
	const n = Math.min(200, Math.max(1, Math.floor(limit)));
	const rows = db
		.select()
		.from(weights)
		.where(
			cursor
				? or(
						lt(weights.date, cursor.date),
						and(eq(weights.date, cursor.date), lt(weights.id, cursor.id))
					)
				: undefined
		)
		.orderBy(desc(weights.date), desc(weights.id))
		.limit(n + 1)
		.all();
	const items = rows.slice(0, n).map(toDTO);
	const last = items[items.length - 1];
	const total = db
		.select({ n: sql<number>`count(*)` })
		.from(weights)
		.get()!.n;
	const firstRow = db
		.select()
		.from(weights)
		.orderBy(asc(weights.date), asc(weights.id))
		.limit(1)
		.get();
	const latestRow = db
		.select()
		.from(weights)
		.orderBy(desc(weights.date), desc(weights.id))
		.limit(1)
		.get();
	return {
		items,
		total,
		next: rows.length > n && last ? { date: last.date, id: last.id } : null,
		first: firstRow ? toDTO(firstRow) : null,
		latest: latestRow ? toDTO(latestRow) : null
	};
}

export function weightsBetween(from: string, to: string, db: DB = getDb()): WeightDTO[] {
	return db
		.select()
		.from(weights)
		.where(between(weights.date, from, to))
		.orderBy(asc(weights.date), asc(weights.id))
		.all()
		.map(toDTO);
}

export function addWeight(
	input: { date: string; kg: number; note?: string | null },
	db: DB = getDb()
): WeightDTO {
	if (!isDate(input.date)) throw new ValidationError('invalid date');
	const note =
		typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;
	return toDTO(
		db
			.insert(weights)
			.values({ date: input.date, kg: validKg(input.kg), note })
			.returning()
			.get()
	);
}

export function updateWeight(
	id: number,
	input: { date?: string; kg?: number; note?: string | null },
	db: DB = getDb()
) {
	const set: Partial<typeof weights.$inferInsert> = {};
	if (input.date !== undefined) {
		if (!isDate(input.date)) throw new ValidationError('invalid date');
		set.date = input.date;
	}
	if (input.kg !== undefined) set.kg = validKg(input.kg);
	if (input.note !== undefined)
		set.note = input.note?.trim() ? input.note.trim().slice(0, 300) : null;
	if (Object.keys(set).length) db.update(weights).set(set).where(eq(weights.id, id)).run();
	const r = db.select().from(weights).where(eq(weights.id, id)).get();
	return r ? toDTO(r) : null;
}

/** Delete and return the raw row so the client can undo. */
export function deleteWeight(id: number, db: DB = getDb()) {
	const r = db.select().from(weights).where(eq(weights.id, id)).get();
	if (!r) return null;
	db.delete(weights).where(eq(weights.id, id)).run();
	return r;
}

/** Undo a deletion: re-insert the row with its original id. */
export function restoreWeight(row: typeof weights.$inferSelect, db: DB = getDb()): WeightDTO {
	if (!isDate(row.date) || typeof row.id !== 'number') throw new ValidationError('invalid weight');
	const note = typeof row.note === 'string' && row.note.trim() ? row.note.slice(0, 300) : null;
	db.insert(weights)
		.values({
			id: row.id,
			date: row.date,
			kg: validKg(row.kg),
			note,
			createdAt: typeof row.createdAt === 'number' ? row.createdAt : Date.now()
		})
		.onConflictDoNothing()
		.run();
	return toDTO(db.select().from(weights).where(eq(weights.id, row.id)).get()!);
}
