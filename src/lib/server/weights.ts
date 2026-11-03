import { asc, between, desc, eq } from 'drizzle-orm';
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

export function weightsBetween(from: string, to: string, db: DB = getDb()): WeightDTO[] {
	return db
		.select()
		.from(weights)
		.where(between(weights.date, from, to))
		.orderBy(asc(weights.date))
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

export function deleteWeight(id: number, db: DB = getDb()) {
	db.delete(weights).where(eq(weights.id, id)).run();
}
