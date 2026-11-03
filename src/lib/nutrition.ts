/**
 * Pure nutrition math, shared by server and client (live preview in the portion picker).
 * Conventions:
 *  - Food values are per 100 g/ml.
 *  - A missing key means unknown. Unknown is never treated as zero silently: aggregations
 *    report which keys were missing for which share of the items ("incomplete data").
 */
import { NUTRIENT_KEYS, type NutrientKey, type Nutrients } from './nutrients';

export const KJ_PER_KCAL = 4.184;
/** salt (g) = sodium (g) × 2.5 */
export const SALT_PER_SODIUM = 2.5;

const round = (n: number, d = 4) => {
	const f = 10 ** d;
	return Math.round(n * f) / f;
};

/** Scale per-100 values to an amount in grams/ml. */
export function scaleNutrients(per100: Nutrients, amount: number): Nutrients {
	const out: Nutrients = {};
	const factor = amount / 100;
	for (const k of NUTRIENT_KEYS) {
		const v = per100[k];
		if (v !== undefined && v !== null && Number.isFinite(v)) out[k] = round(v * factor);
	}
	return out;
}

/**
 * Fill derivable values: kcal⇄kJ, salt⇄sodium, kcal from macros (Atwater) as last resort.
 * Returns a new object; never overwrites provided values.
 */
export function completeNutrients(n: Nutrients): Nutrients {
	const out: Nutrients = { ...n };
	if (out.energy_kcal === undefined && out.energy_kj !== undefined) {
		out.energy_kcal = round(out.energy_kj / KJ_PER_KCAL, 1);
	}
	if (out.energy_kj === undefined && out.energy_kcal !== undefined) {
		out.energy_kj = round(out.energy_kcal * KJ_PER_KCAL, 1);
	}
	if (out.salt === undefined && out.sodium !== undefined) {
		out.salt = round((out.sodium / 1000) * SALT_PER_SODIUM, 4);
	}
	if (out.sodium === undefined && out.salt !== undefined) {
		out.sodium = round((out.salt / SALT_PER_SODIUM) * 1000, 2);
	}
	if (
		out.energy_kcal === undefined &&
		out.protein !== undefined &&
		out.carbs !== undefined &&
		out.fat !== undefined
	) {
		const kcal =
			out.protein * 4 + out.carbs * 4 + out.fat * 9 + (out.fiber ?? 0) * 2 + (out.alcohol ?? 0) * 7;
		out.energy_kcal = round(kcal, 1);
		out.energy_kj = round(kcal * KJ_PER_KCAL, 1);
	}
	return out;
}

export interface AggregateItem {
	/** nutrient values for this item (already scaled to the item amount) */
	nutrients: Nutrients;
	/** keys that are only partially known in this item (e.g. recipe with an ingredient lacking data) */
	partial?: NutrientKey[];
}

export interface Aggregate {
	totals: Nutrients;
	/** number of items lacking (or only partially knowing) each key; only keys with ≥1 are present */
	missing: Partial<Record<NutrientKey, number>>;
	count: number;
}

/**
 * Sum nutrients of several items. A key appears in `totals` if at least one item knows it.
 * `missing[key]` counts items where the key is unknown or partial.
 */
export function aggregate(items: AggregateItem[]): Aggregate {
	const totals: Nutrients = {};
	const missing: Partial<Record<NutrientKey, number>> = {};
	for (const item of items) {
		const partial = new Set(item.partial ?? []);
		for (const k of NUTRIENT_KEYS) {
			const v = item.nutrients[k];
			if (v === undefined || v === null) {
				missing[k] = (missing[k] ?? 0) + 1;
			} else {
				totals[k] = round((totals[k] ?? 0) + v);
				if (partial.has(k)) missing[k] = (missing[k] ?? 0) + 1;
			}
		}
	}
	// A key that no item knows is simply unknown: drop it from `missing` when count is 0 items known? No —
	// keep the information: if totals lacks the key, every item was missing it.
	return { totals, missing, count: items.length };
}

/** Is the aggregate value for `key` incomplete (some items lack it)? */
export function isIncomplete(agg: Aggregate, key: NutrientKey): boolean {
	return (agg.missing[key] ?? 0) > 0 && agg.count > 0;
}

export interface RecipeIngredient {
	per100: Nutrients;
	partial?: NutrientKey[];
	grams: number;
}

export interface RecipeResult {
	/** total nutrients of the whole recipe */
	total: Nutrients;
	/** per 100 g of final (cooked) weight */
	per100: Nutrients;
	/** per serving */
	perServing: Nutrients;
	rawWeight: number;
	finalWeight: number;
	servingWeight: number;
	/** keys where at least one ingredient (with grams > 0) lacks data */
	partial: NutrientKey[];
}

/**
 * Aggregate a recipe. `cookedWeight` (optional) is the weight after cooking; nutrients are
 * conserved so per-100 values are relative to the final weight (water loss concentrates them).
 */
export function computeRecipe(
	ingredients: RecipeIngredient[],
	opts: { servings?: number | null; cookedWeight?: number | null } = {}
): RecipeResult {
	const used = ingredients.filter((i) => i.grams > 0);
	const agg = aggregate(
		used.map((i) => ({ nutrients: scaleNutrients(i.per100, i.grams), partial: i.partial }))
	);
	const rawWeight = round(
		used.reduce((s, i) => s + i.grams, 0),
		2
	);
	const finalWeight = opts.cookedWeight && opts.cookedWeight > 0 ? opts.cookedWeight : rawWeight;
	const servings = opts.servings && opts.servings > 0 ? opts.servings : 1;
	const per100: Nutrients = {};
	const perServing: Nutrients = {};
	for (const k of NUTRIENT_KEYS) {
		const v = agg.totals[k];
		if (v === undefined) continue;
		if (finalWeight > 0) per100[k] = round((v * 100) / finalWeight);
		perServing[k] = round(v / servings);
	}
	const partial = NUTRIENT_KEYS.filter((k) => agg.totals[k] !== undefined && isIncomplete(agg, k));
	return {
		total: agg.totals,
		per100,
		perServing,
		rawWeight,
		finalWeight,
		servingWeight: round(finalWeight / servings, 1),
		partial
	};
}

/** Energy shares of macros in % (protein/carbs/fat), based on 4/4/9 kcal/g. */
export function macroEnergyShares(n: Nutrients): { protein: number; carbs: number; fat: number } {
	const p = (n.protein ?? 0) * 4;
	const c = (n.carbs ?? 0) * 4;
	const f = (n.fat ?? 0) * 9;
	const sum = p + c + f;
	if (sum <= 0) return { protein: 0, carbs: 0, fat: 0 };
	return {
		protein: round((p / sum) * 100, 1),
		carbs: round((c / sum) * 100, 1),
		fat: round((f / sum) * 100, 1)
	};
}

/** Simple trailing moving average over `window` days for (date-sorted) series with gaps. */
export function movingAverage(
	points: { date: string; value: number }[],
	window = 7
): { date: string; value: number }[] {
	const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
	return sorted.map((p) => {
		const end = Date.parse(p.date + 'T00:00:00Z');
		const start = end - (window - 1) * 86400000;
		const inWin = sorted.filter((q) => {
			const t = Date.parse(q.date + 'T00:00:00Z');
			return t >= start && t <= end;
		});
		const avg = inWin.reduce((s, q) => s + q.value, 0) / inWin.length;
		return { date: p.date, value: round(avg, 2) };
	});
}

export interface Contribution {
	key: string;
	label: string;
	value: number;
	share: number;
}

/** Rank contributors for one nutrient: group by `key`, sum, sort desc, share in %. */
export function rankContributions(
	items: { key: string; label: string; nutrients: Nutrients }[],
	nutrient: NutrientKey
): { total: number; items: Contribution[] } {
	const map = new Map<string, Contribution>();
	for (const it of items) {
		const v = it.nutrients[nutrient];
		if (v === undefined || v <= 0) continue;
		const c = map.get(it.key) ?? { key: it.key, label: it.label, value: 0, share: 0 };
		c.value += v;
		map.set(it.key, c);
	}
	const list = [...map.values()].sort((a, b) => b.value - a.value);
	const total = list.reduce((s, c) => s + c.value, 0);
	for (const c of list) {
		c.value = round(c.value, 3);
		c.share = total > 0 ? round((c.value / total) * 100, 1) : 0;
	}
	return { total: round(total, 3), items: list };
}
