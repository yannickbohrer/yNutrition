/** Custom foods, user portions, recipes. */
import crypto from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { foodPortions, foods, recipeItems, recipes, type FoodRow } from './db/schema';
import { sanitizeNutrients, type Nutrients } from '../nutrients';
import { completeNutrients, computeRecipe } from '../nutrition';
import type { Basis, Lang, RecipeDTO } from '../types';
import { foodName } from './foods/repo';
import { ValidationError, validAmount } from './log';

const cleanStr = (v: unknown, max = 200): string | null => {
	if (typeof v !== 'string') return null;
	const s = v.trim().replace(/\s+/g, ' ').replace(/ß/g, 'ss');
	return s ? s.slice(0, max) : null;
};

export interface CustomFoodInput {
	name: string;
	nameEn?: string | null;
	brand?: string | null;
	barcode?: string | null;
	basis?: Basis;
	/** nutrients are given per 100 g/ml ('100') or per serving ('serving') */
	per?: '100' | 'serving';
	servingAmount?: number | null;
	servingLabel?: string | null;
	nutrients: Record<string, unknown>;
	portions?: { label: string; amount: number }[];
}

function normalizeCustom(input: CustomFoodInput) {
	const name = cleanStr(input.name);
	if (!name) throw new ValidationError('name required');
	const basis: Basis = input.basis === 'ml' ? 'ml' : 'g';
	let n: Nutrients = sanitizeNutrients(input.nutrients);
	let servingAmount: number | null = null;
	if (
		input.servingAmount !== undefined &&
		input.servingAmount !== null &&
		input.servingAmount !== 0
	)
		servingAmount = validAmount(input.servingAmount);
	if (input.per === 'serving') {
		if (!servingAmount) throw new ValidationError('serving amount required');
		const f = 100 / servingAmount;
		n = Object.fromEntries(
			Object.entries(n).map(([k, v]) => [k, Math.round(v * f * 1e4) / 1e4])
		) as Nutrients;
	}
	const barcode = cleanStr(input.barcode, 20)?.replace(/\D/g, '') || null;
	return {
		name,
		nameEn: cleanStr(input.nameEn),
		brand: cleanStr(input.brand, 100),
		barcode,
		basis,
		nutrients: completeNutrients(n),
		servingAmount,
		servingLabel: cleanStr(input.servingLabel, 60)
	};
}

export function createCustomFood(input: CustomFoodInput, db: DB = getDb()): number {
	const c = normalizeCustom(input);
	return db.transaction((tx) => {
		const row = tx
			.insert(foods)
			.values({
				source: 'custom',
				sourceId: crypto.randomUUID(),
				nameDe: c.name,
				nameEn: c.nameEn,
				brand: c.brand,
				barcode: c.barcode,
				basis: c.basis,
				nutrients: c.nutrients,
				servingSize: c.servingLabel,
				servingQuantity: c.servingAmount
			})
			.returning({ id: foods.id })
			.get();
		for (const [i, p] of (input.portions ?? []).entries()) {
			const label = cleanStr(p.label, 60);
			if (!label) continue;
			tx.insert(foodPortions)
				.values({ foodId: row.id, labelDe: label, amount: validAmount(p.amount), sort: i })
				.run();
		}
		return row.id;
	});
}

export function updateCustomFood(id: number, input: CustomFoodInput, db: DB = getDb()) {
	const f = db.select().from(foods).where(eq(foods.id, id)).get();
	if (!f || f.source !== 'custom') throw new ValidationError('not a custom food');
	const c = normalizeCustom(input);
	db.update(foods)
		.set({
			nameDe: c.name,
			nameEn: c.nameEn,
			brand: c.brand,
			barcode: c.barcode,
			basis: c.basis,
			nutrients: c.nutrients,
			servingSize: c.servingLabel,
			servingQuantity: c.servingAmount,
			updatedAt: Date.now()
		})
		.where(eq(foods.id, id))
		.run();
	if (input.portions) {
		db.delete(foodPortions).where(eq(foodPortions.foodId, id)).run();
		for (const [i, p] of input.portions.entries()) {
			const label = cleanStr(p.label, 60);
			if (label)
				db.insert(foodPortions)
					.values({ foodId: id, labelDe: label, amount: validAmount(p.amount), sort: i })
					.run();
		}
	}
	recomputeRecipesUsing(id, db);
}

/** Soft delete (log entries keep their snapshot; recipes keep referencing the row). */
export function deleteFood(id: number, db: DB = getDb()) {
	const f = db.select().from(foods).where(eq(foods.id, id)).get();
	if (!f || (f.source !== 'custom' && f.source !== 'recipe'))
		throw new ValidationError('not deletable');
	db.update(foods).set({ deletedAt: Date.now() }).where(eq(foods.id, id)).run();
}

export function addPortion(foodId: number, label: string, amount: number, db: DB = getDb()) {
	const l = cleanStr(label, 60);
	if (!l) throw new ValidationError('label required');
	return db
		.insert(foodPortions)
		.values({ foodId, labelDe: l, amount: validAmount(amount), sort: 100 })
		.returning()
		.get();
}

export function deletePortion(foodId: number, portionId: number, db: DB = getDb()) {
	db.delete(foodPortions)
		.where(and(eq(foodPortions.foodId, foodId), eq(foodPortions.id, portionId)))
		.run();
}

// ---------------- recipes ----------------

export interface RecipeInput {
	name: string;
	servings: number;
	cookedWeight?: number | null;
	notes?: string | null;
	items: { foodId: number; amount: number }[];
}

/** All recipe ids that (transitively) contain `foodId`. */
function recipesContaining(foodId: number, db: DB, seen = new Set<number>()): Set<number> {
	const parents = db
		.select({ id: recipeItems.recipeId })
		.from(recipeItems)
		.where(eq(recipeItems.foodId, foodId))
		.all();
	for (const p of parents) {
		if (seen.has(p.id)) continue;
		seen.add(p.id);
		recipesContaining(p.id, db, seen);
	}
	return seen;
}

function computeFor(
	items: { foodId: number; amount: number }[],
	servings: number,
	cookedWeight: number | null,
	db: DB
) {
	const ids = items.map((i) => i.foodId);
	const rows = ids.length ? db.select().from(foods).where(inArray(foods.id, ids)).all() : [];
	const byId = new Map(rows.map((r) => [r.id, r]));
	return computeRecipe(
		items.map((i) => {
			const f = byId.get(i.foodId);
			return { per100: f?.nutrients ?? {}, partial: f?.partial ?? [], grams: i.amount };
		}),
		{ servings, cookedWeight }
	);
}

export function saveRecipe(input: RecipeInput, id: number | null = null, db: DB = getDb()): number {
	const name = cleanStr(input.name);
	if (!name) throw new ValidationError('name required');
	const servings = Number(input.servings);
	if (!Number.isFinite(servings) || servings <= 0 || servings > 1000)
		throw new ValidationError('invalid servings');
	const cookedWeight = input.cookedWeight ? validAmount(input.cookedWeight) : null;
	const items = (input.items ?? []).map((i) => ({
		foodId: Number(i.foodId),
		amount: validAmount(i.amount)
	}));
	if (!items.length) throw new ValidationError('ingredients required');
	if (id !== null) {
		const forbidden = recipesContaining(id, db);
		forbidden.add(id);
		if (items.some((i) => forbidden.has(i.foodId))) throw new ValidationError('recipe cycle');
	}
	const existing = db
		.select({ id: foods.id })
		.from(foods)
		.where(
			inArray(
				foods.id,
				items.map((i) => i.foodId)
			)
		)
		.all();
	if (existing.length !== new Set(items.map((i) => i.foodId)).size)
		throw new ValidationError('unknown ingredient');

	const r = computeFor(items, servings, cookedWeight, db);
	return db.transaction((tx) => {
		let foodId = id;
		const values = {
			nameDe: name,
			nameEn: name,
			basis: 'g' as const,
			nutrients: r.per100,
			partial: r.partial,
			servingQuantity: r.servingWeight,
			servingSize: null,
			updatedAt: Date.now()
		};
		if (foodId === null) {
			foodId = tx
				.insert(foods)
				.values({ source: 'recipe', sourceId: crypto.randomUUID(), ...values })
				.returning({ id: foods.id })
				.get().id;
			tx.insert(recipes)
				.values({ foodId, servings, cookedWeight, notes: cleanStr(input.notes, 2000) })
				.run();
		} else {
			const f = tx.select().from(foods).where(eq(foods.id, foodId)).get();
			if (!f || f.source !== 'recipe') throw new ValidationError('not a recipe');
			tx.update(foods).set(values).where(eq(foods.id, foodId)).run();
			tx.update(recipes)
				.set({ servings, cookedWeight, notes: cleanStr(input.notes, 2000) })
				.where(eq(recipes.foodId, foodId))
				.run();
			tx.delete(recipeItems).where(eq(recipeItems.recipeId, foodId)).run();
		}
		items.forEach((it, i) =>
			tx
				.insert(recipeItems)
				.values({ recipeId: foodId!, foodId: it.foodId, amount: it.amount, sort: i })
				.run()
		);
		return foodId;
	});
}

/** Recompute stored nutrients of recipes that use `foodId` (after a custom food edit). */
export function recomputeRecipesUsing(foodId: number, db: DB = getDb()) {
	const ids = [...recipesContaining(foodId, db)];
	// recompute inner recipes before outer ones: repeat until stable (depth is tiny)
	for (let pass = 0; pass < 3; pass++) {
		for (const rid of ids) {
			const rec = db.select().from(recipes).where(eq(recipes.foodId, rid)).get();
			if (!rec) continue;
			const items = db.select().from(recipeItems).where(eq(recipeItems.recipeId, rid)).all();
			const r = computeFor(items, rec.servings, rec.cookedWeight, db);
			db.update(foods)
				.set({
					nutrients: r.per100,
					partial: r.partial,
					servingQuantity: r.servingWeight,
					updatedAt: Date.now()
				})
				.where(eq(foods.id, rid))
				.run();
		}
	}
}

export function getRecipe(id: number, lang: Lang, db: DB = getDb()): RecipeDTO | null {
	const f = db.select().from(foods).where(eq(foods.id, id)).get();
	const rec = db.select().from(recipes).where(eq(recipes.foodId, id)).get();
	if (!f || !rec) return null;
	const items = db
		.select({ item: recipeItems, food: foods })
		.from(recipeItems)
		.innerJoin(foods, eq(foods.id, recipeItems.foodId))
		.where(eq(recipeItems.recipeId, id))
		.orderBy(asc(recipeItems.sort))
		.all();
	const r = computeFor(
		items.map((i) => ({ foodId: i.food.id, amount: i.item.amount })),
		rec.servings,
		rec.cookedWeight,
		db
	);
	return {
		id,
		name: f.nameDe ?? '',
		servings: rec.servings,
		cookedWeight: rec.cookedWeight,
		notes: rec.notes,
		items: items.map((i) => ({
			foodId: i.food.id,
			name: foodName(i.food, lang),
			basis: i.food.basis,
			amount: i.item.amount,
			kcal:
				i.food.nutrients?.energy_kcal !== undefined
					? (i.food.nutrients.energy_kcal * i.item.amount) / 100
					: null
		})),
		per100: r.per100,
		perServing: r.perServing,
		total: r.total,
		rawWeight: r.rawWeight,
		finalWeight: r.finalWeight,
		servingWeight: r.servingWeight,
		partial: r.partial
	};
}

export function listByFoodSource(source: 'custom' | 'recipe', db: DB = getDb()): FoodRow[] {
	return db
		.select()
		.from(foods)
		.where(and(eq(foods.source, source), isNull(foods.deletedAt)))
		.orderBy(asc(foods.nameDe))
		.all();
}
