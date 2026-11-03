import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type DB } from '../db';
import { foods, logEntries } from '../db/schema';
import { lookupBarcode, searchLocal, searchOnline, suggestions, type Sources } from './service';
import { setFavorite } from './repo';
import { RateLimitedError, type FoodSource, type NormalizedFood } from './types';
import { buildFtsQuery, tokenize } from './search';

let db: DB;

function addFood(nameDe: string, extra: Partial<typeof foods.$inferInsert> = {}) {
	return db
		.insert(foods)
		.values({
			source: 'swissfcd',
			sourceId: nameDe,
			nameDe,
			nutrients: { energy_kcal: 100, protein: 1, carbs: 1, fat: 1 },
			...extra
		})
		.returning()
		.get().id;
}

const nf = (sourceId: string, nameDe: string): NormalizedFood => ({
	source: 'off',
	sourceId,
	nameDe,
	nameEn: null,
	brand: 'Brand',
	barcode: sourceId,
	category: null,
	basis: 'g',
	nutrients: { energy_kcal: 200 },
	servingSize: null,
	servingQuantity: null
});

function fakeSources(off: Partial<FoodSource> = {}): Sources {
	return {
		off: { id: 'off', enabled: () => true, ...off } as FoodSource,
		usda: { id: 'usda', enabled: () => false } as FoodSource
	};
}

beforeEach(() => {
	db = createTestDb();
	for (const n of [
		'Apfel, roh',
		'Apfelsaft',
		'Äpfel, getrocknet',
		'Vollkornbrot',
		'Müesli, Bircher',
		'Banane, roh',
		'Ananas, roh'
	])
		addFood(n);
});

describe('local search', () => {
	it('prefix and diacritic-insensitive: "apf" finds Apfel and Äpfel', () => {
		const names = searchLocal('apf', 'de', db).local.map((f) => f.name);
		expect(names).toContain('Apfel, roh');
		expect(names).toContain('Äpfel, getrocknet');
		expect(names[0]).toBe('Apfel, roh');
	});
	it('finds compound words via trigram: "brot" → Vollkornbrot', () => {
		expect(searchLocal('brot', 'de', db).local.map((f) => f.name)).toContain('Vollkornbrot');
	});
	it('handles "ue" typed for "ü"', () => {
		expect(searchLocal('muesli', 'de', db).local.map((f) => f.name)).toContain('Müesli, Bircher');
	});
	it('puts favorites/used foods into the "mine" section', () => {
		const id = addFood('Apfelmus');
		setFavorite(id, true, db);
		const r = searchLocal('apfel', 'de', db);
		expect(r.mine.map((f) => f.name)).toEqual(['Apfelmus']);
		expect(r.local.map((f) => f.name)).not.toContain('Apfelmus');
	});
	it('ignores garbage queries safely', () => {
		expect(searchLocal('"*(', 'de', db).local).toEqual([]);
		expect(buildFtsQuery(tokenize(''))).toBeNull();
	});
	it('excludes soft-deleted foods', () => {
		addFood('Apfelkuchen', { deletedAt: Date.now() });
		expect(searchLocal('apfelkuchen', 'de', db).local).toEqual([]);
	});
});

describe('online search', () => {
	it('caches results and does not hit the source twice', async () => {
		const search = vi.fn(async () => [nf('761', 'Rivella Rot')]);
		const src = fakeSources({ search });
		const a = await searchOnline('rivella', 'de', db, src);
		expect(a.results.map((r) => r.name)).toEqual(['Rivella Rot']);
		expect(a.cached).toBe(false);
		const b = await searchOnline('Rivella ', 'de', db, src);
		expect(b.cached).toBe(true);
		expect(b.results).toHaveLength(1);
		expect(search).toHaveBeenCalledTimes(1);
		// cached product is now found locally
		expect(searchLocal('rivella', 'de', db).local[0].source).toBe('off');
	});
	it('reports rate limiting without caching', async () => {
		const src = fakeSources({
			search: async () => {
				throw new RateLimitedError('x');
			}
		});
		const r = await searchOnline('cola', 'de', db, src);
		expect(r.limited).toBe(true);
	});
	it('skips very short queries', async () => {
		const search = vi.fn();
		await searchOnline('a', 'de', db, fakeSources({ search }));
		expect(search).not.toHaveBeenCalled();
	});
});

describe('barcode lookup', () => {
	it('uses the local DB first (custom food with barcode)', async () => {
		addFood('Mein Riegel', { source: 'custom', sourceId: 'c1', barcode: '4000000000001' });
		const lookup = vi.fn();
		const r = await lookupBarcode(
			'4000000000001',
			'de',
			db,
			fakeSources({ lookupBarcode: lookup })
		);
		expect(r.food?.name).toBe('Mein Riegel');
		expect(lookup).not.toHaveBeenCalled();
	});
	it('fetches from OFF, caches, then serves locally', async () => {
		const lookup = vi.fn(async (c: string) => nf(c, 'Ovomaltine'));
		const src = fakeSources({ lookupBarcode: lookup });
		const a = await lookupBarcode('7612100021842', 'de', db, src);
		expect(a.food?.name).toBe('Ovomaltine');
		const b = await lookupBarcode('7612100021842', 'de', db, src);
		expect(b.food?.id).toBe(a.food?.id);
		expect(lookup).toHaveBeenCalledTimes(1);
	});
	it('remembers misses for a day', async () => {
		const lookup = vi.fn(async () => null);
		const src = fakeSources({ lookupBarcode: lookup });
		expect((await lookupBarcode('12345678', 'de', db, src)).food).toBeNull();
		expect((await lookupBarcode('12345678', 'de', db, src)).food).toBeNull();
		expect(lookup).toHaveBeenCalledTimes(1);
	});
});

describe('suggestions', () => {
	it('lists favorites, recents and frequent foods', () => {
		const a = addFood('Joghurt');
		const b = addFood('Kaffee');
		setFavorite(a, true, db);
		for (let i = 0; i < 3; i++)
			db.insert(logEntries)
				.values({
					date: '2026-01-01',
					time: '08:00',
					foodId: b,
					foodName: 'Kaffee',
					amount: 150,
					per100: {},
					createdAt: 1000 + i
				})
				.run();
		const s = suggestions('de', db);
		expect(s.favorites.map((f) => f.name)).toEqual(['Joghurt']);
		expect(s.recent.map((f) => f.name)).toEqual(['Kaffee']);
		expect(s.frequent.map((f) => f.name)).toEqual(['Kaffee']);
	});
});
