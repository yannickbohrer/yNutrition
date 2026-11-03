/** Food persistence and DTO mapping. */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, type DB } from '../db';
import { favorites, foodPortions, foods, logEntries, recipes, type FoodRow } from '../db/schema';
import type { FoodDTO, FoodSummary, Lang } from '../../types';
import { buildPortions, defaultAmount } from './portions';
import type { NormalizedFood } from './types';

export function foodName(f: Pick<FoodRow, 'nameDe' | 'nameEn'>, lang: Lang): string {
	return (lang === 'en' ? (f.nameEn ?? f.nameDe) : (f.nameDe ?? f.nameEn)) ?? '?';
}

export function isIncomplete(f: Pick<FoodRow, 'nutrients'>): boolean {
	const n = f.nutrients ?? {};
	return (
		n.energy_kcal === undefined ||
		n.protein === undefined ||
		n.carbs === undefined ||
		n.fat === undefined
	);
}

export function sourceUrl(f: Pick<FoodRow, 'source' | 'sourceId'>): string | null {
	switch (f.source) {
		case 'off':
			return `https://world.openfoodfacts.org/product/${encodeURIComponent(f.sourceId)}`;
		case 'usda':
			return `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(f.sourceId)}/nutrients`;
		case 'swissfcd':
			return 'https://naehrwertdaten.ch/';
		default:
			return null;
	}
}

export function favoriteIds(db: DB = getDb()): Set<number> {
	return new Set(
		db
			.select({ id: favorites.foodId })
			.from(favorites)
			.all()
			.map((r) => r.id)
	);
}

export function toSummary(f: FoodRow, lang: Lang, favs: Set<number>): FoodSummary {
	return {
		id: f.id,
		source: f.source,
		name: foodName(f, lang),
		brand: f.brand,
		basis: f.basis,
		kcal: f.nutrients?.energy_kcal ?? null,
		favorite: favs.has(f.id),
		incomplete: isIncomplete(f),
		barcode: f.barcode
	};
}

export function getFoodRow(id: number, db: DB = getDb()): FoodRow | undefined {
	return db.select().from(foods).where(eq(foods.id, id)).get();
}

export function lastAmountFor(foodId: number, db: DB = getDb()): number | null {
	const row = db
		.select({ amount: logEntries.amount })
		.from(logEntries)
		.where(eq(logEntries.foodId, foodId))
		.orderBy(desc(logEntries.createdAt), desc(logEntries.id))
		.limit(1)
		.get();
	return row?.amount ?? null;
}

export function getFoodDTO(id: number, lang: Lang, db: DB = getDb()): FoodDTO | null {
	const f = getFoodRow(id, db);
	if (!f) return null;
	const userPortions = db
		.select()
		.from(foodPortions)
		.where(eq(foodPortions.foodId, id))
		.orderBy(foodPortions.sort, foodPortions.id)
		.all();
	let recipeServingWeight: number | null = null;
	if (f.source === 'recipe') {
		const r = db.select().from(recipes).where(eq(recipes.foodId, id)).get();
		if (r) recipeServingWeight = (f.servingQuantity ?? 0) > 0 ? f.servingQuantity : null;
	}
	const portions = buildPortions(
		{
			source: f.source,
			nameDe: f.nameDe,
			nameEn: f.nameEn,
			basis: f.basis,
			density: f.density,
			servingSize: f.source === 'recipe' ? null : f.servingSize,
			servingQuantity: f.source === 'recipe' ? null : f.servingQuantity,
			userPortions,
			recipeServingWeight
		},
		lang
	);
	const last = lastAmountFor(id, db);
	const favs = favoriteIds(db);
	return {
		...toSummary(f, lang, favs),
		sourceId: f.sourceId,
		nameDe: f.nameDe,
		nameEn: f.nameEn,
		category: f.category,
		barcode: f.barcode,
		nutrients: f.nutrients ?? {},
		partial: f.partial ?? [],
		portions,
		defaultAmount: defaultAmount(portions, last),
		lastAmount: last,
		sourceUrl: sourceUrl(f),
		servingSize: f.servingSize,
		editable: f.source === 'custom' || f.source === 'recipe',
		deleted: f.deletedAt !== null
	};
}

/** Insert or update a food coming from a remote source (cache). Returns the local id. */
export function upsertNormalized(n: NormalizedFood, db: DB = getDb()): number {
	const now = Date.now();
	const row = db
		.insert(foods)
		.values({
			source: n.source,
			sourceId: n.sourceId,
			nameDe: n.nameDe,
			nameEn: n.nameEn,
			brand: n.brand,
			barcode: n.barcode,
			category: n.category,
			basis: n.basis,
			nutrients: n.nutrients,
			servingSize: n.servingSize,
			servingQuantity: n.servingQuantity,
			fetchedAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [foods.source, foods.sourceId],
			set: {
				nameDe: n.nameDe,
				nameEn: n.nameEn,
				brand: n.brand,
				barcode: n.barcode,
				category: n.category,
				basis: n.basis,
				nutrients: n.nutrients,
				servingSize: n.servingSize,
				servingQuantity: n.servingQuantity,
				fetchedAt: now,
				updatedAt: now
			}
		})
		.returning({ id: foods.id })
		.get();
	return row.id;
}

export function summariesByIds(ids: number[], lang: Lang, db: DB = getDb()): FoodSummary[] {
	if (!ids.length) return [];
	const rows = db
		.select()
		.from(foods)
		.where(and(inArray(foods.id, ids), isNull(foods.deletedAt)))
		.all();
	const byId = new Map(rows.map((r) => [r.id, r]));
	const favs = favoriteIds(db);
	return ids.flatMap((id) => {
		const r = byId.get(id);
		return r ? [toSummary(r, lang, favs)] : [];
	});
}

export function findByBarcode(barcode: string, db: DB = getDb()): FoodRow | undefined {
	const variants = barcodeVariants(barcode);
	const rows = db
		.select()
		.from(foods)
		.where(and(inArray(foods.barcode, variants), isNull(foods.deletedAt)))
		.all();
	// prefer custom foods over cached OFF products
	return rows.find((r) => r.source === 'custom') ?? rows[0];
}

/** EAN-13 ⇄ UPC-A (12 digits, leading zero) variants. */
export function barcodeVariants(code: string): string[] {
	const c = code.replace(/\D/g, '');
	const v = new Set([c]);
	if (c.length === 12) v.add('0' + c);
	if (c.length === 13 && c.startsWith('0')) v.add(c.slice(1));
	if (c.length === 8) v.add(c.padStart(13, '0'));
	return [...v];
}

export function setFavorite(foodId: number, on: boolean, db: DB = getDb()) {
	if (on) db.insert(favorites).values({ foodId }).onConflictDoNothing().run();
	else db.delete(favorites).where(eq(favorites.foodId, foodId)).run();
}

/** Recently/frequently used foods (from the log), most recent first. */
export function recentFoods(limit: number, db: DB = getDb()) {
	return db
		.select({
			foodId: logEntries.foodId,
			last: sql<number>`max(${logEntries.createdAt})`,
			uses: sql<number>`count(*)`
		})
		.from(logEntries)
		.innerJoin(foods, eq(foods.id, logEntries.foodId))
		.where(isNull(foods.deletedAt))
		.groupBy(logEntries.foodId)
		.orderBy(sql`max(${logEntries.createdAt}) desc`)
		.limit(limit)
		.all()
		.filter((r): r is { foodId: number; last: number; uses: number } => r.foodId !== null);
}

export function usageCounts(db: DB = getDb()): Map<number, number> {
	const rows = db
		.select({ foodId: logEntries.foodId, uses: sql<number>`count(*)` })
		.from(logEntries)
		.groupBy(logEntries.foodId)
		.all();
	return new Map(rows.filter((r) => r.foodId !== null).map((r) => [r.foodId as number, r.uses]));
}
