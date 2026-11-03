import { describe, expect, it } from 'vitest';
import {
	aggregate,
	completeNutrients,
	computeRecipe,
	isIncomplete,
	macroEnergyShares,
	movingAverage,
	rankContributions,
	scaleNutrients
} from './nutrition';
import { sanitizeNutrients } from './nutrients';

describe('scaleNutrients', () => {
	it('scales per-100 values linearly', () => {
		expect(scaleNutrients({ energy_kcal: 89, protein: 1.1 }, 120)).toEqual({
			energy_kcal: 106.8,
			protein: 1.32
		});
	});
	it('keeps unknown keys unknown (not zero)', () => {
		const s = scaleNutrients({ energy_kcal: 100 }, 50);
		expect(s.fat).toBeUndefined();
		expect(s.energy_kcal).toBe(50);
	});
	it('handles zero amount', () => {
		expect(scaleNutrients({ energy_kcal: 100, fat: 0 }, 0)).toEqual({ energy_kcal: 0, fat: 0 });
	});
});

describe('completeNutrients', () => {
	it('derives kcal from kJ and vice versa', () => {
		expect(completeNutrients({ energy_kj: 418.4 }).energy_kcal).toBe(100);
		expect(completeNutrients({ energy_kcal: 100 }).energy_kj).toBe(418.4);
	});
	it('derives salt from sodium (mg) and sodium from salt', () => {
		expect(completeNutrients({ sodium: 400 }).salt).toBe(1);
		expect(completeNutrients({ salt: 1 }).sodium).toBe(400);
	});
	it('derives kcal from macros only as last resort', () => {
		const c = completeNutrients({ protein: 10, carbs: 20, fat: 5, fiber: 2 });
		expect(c.energy_kcal).toBe(10 * 4 + 20 * 4 + 5 * 9 + 2 * 2);
	});
	it('never overwrites provided values', () => {
		expect(completeNutrients({ energy_kcal: 50, energy_kj: 999 })).toMatchObject({
			energy_kcal: 50,
			energy_kj: 999
		});
	});
});

describe('aggregate (daily totals)', () => {
	it('sums known values and counts missing ones', () => {
		const agg = aggregate([
			{ nutrients: { energy_kcal: 100, fiber: 2 } },
			{ nutrients: { energy_kcal: 250.5 } },
			{ nutrients: { energy_kcal: 50, fiber: 1 }, partial: ['fiber'] }
		]);
		expect(agg.totals.energy_kcal).toBe(400.5);
		expect(agg.totals.fiber).toBe(3);
		expect(agg.missing.fiber).toBe(2);
		expect(isIncomplete(agg, 'fiber')).toBe(true);
		expect(isIncomplete(agg, 'energy_kcal')).toBe(false);
		expect(agg.totals.vit_c).toBeUndefined();
		expect(agg.missing.vit_c).toBe(3);
	});
	it('empty day', () => {
		const agg = aggregate([]);
		expect(agg.totals).toEqual({});
		expect(agg.count).toBe(0);
		expect(isIncomplete(agg, 'energy_kcal')).toBe(false);
	});
});

describe('computeRecipe', () => {
	const pasta = {
		per100: { energy_kcal: 350, protein: 12, carbs: 70, fat: 1.5, fiber: 3 },
		grams: 200
	};
	const sauce = { per100: { energy_kcal: 50, protein: 1.5, carbs: 8, fat: 1 }, grams: 300 };

	it('totals, per 100 g of raw weight, per serving', () => {
		const r = computeRecipe([pasta, sauce], { servings: 2 });
		expect(r.total.energy_kcal).toBe(700 + 150);
		expect(r.rawWeight).toBe(500);
		expect(r.finalWeight).toBe(500);
		expect(r.per100.energy_kcal).toBe(170);
		expect(r.perServing.energy_kcal).toBe(425);
		expect(r.servingWeight).toBe(250);
	});
	it('uses cooked weight for per-100 values', () => {
		const r = computeRecipe([pasta, sauce], { servings: 2, cookedWeight: 850 });
		expect(r.per100.energy_kcal).toBe(100);
		expect(r.perServing.energy_kcal).toBe(425);
		expect(r.servingWeight).toBe(425);
	});
	it('flags nutrients missing in some ingredients as partial', () => {
		const r = computeRecipe([pasta, sauce]);
		expect(r.partial).toContain('fiber');
		expect(r.partial).not.toContain('protein');
		expect(r.total.fiber).toBe(6);
	});
	it('propagates partial flags of nested recipes', () => {
		const r = computeRecipe([
			{ per100: { energy_kcal: 100, fiber: 1 }, partial: ['fiber'], grams: 100 }
		]);
		expect(r.partial).toEqual(['fiber']);
	});
	it('ignores zero-gram ingredients and defaults servings to 1', () => {
		const r = computeRecipe([pasta, { ...sauce, grams: 0 }]);
		expect(r.partial).toEqual([]);
		expect(r.perServing.energy_kcal).toBe(700);
	});
	it('empty recipe', () => {
		const r = computeRecipe([]);
		expect(r.per100).toEqual({});
		expect(r.finalWeight).toBe(0);
	});
});

describe('helpers', () => {
	it('macro energy shares', () => {
		expect(macroEnergyShares({ protein: 25, carbs: 25, fat: 0 })).toEqual({
			protein: 50,
			carbs: 50,
			fat: 0
		});
		expect(macroEnergyShares({})).toEqual({ protein: 0, carbs: 0, fat: 0 });
	});
	it('7-day moving average handles gaps', () => {
		const ma = movingAverage(
			[
				{ date: '2026-01-01', value: 80 },
				{ date: '2026-01-03', value: 82 },
				{ date: '2026-01-10', value: 79 }
			],
			7
		);
		expect(ma.map((m) => m.value)).toEqual([80, 81, 79]);
	});
	it('ranks contributions with shares', () => {
		const r = rankContributions(
			[
				{ key: 'a', label: 'Apfel', nutrients: { sugars: 10 } },
				{ key: 'b', label: 'Brot', nutrients: { sugars: 5 } },
				{ key: 'a', label: 'Apfel', nutrients: { sugars: 15 } },
				{ key: 'c', label: 'Käse', nutrients: {} }
			],
			'sugars'
		);
		expect(r.total).toBe(30);
		expect(r.items.map((i) => [i.key, i.share])).toEqual([
			['a', 83.3],
			['b', 16.7]
		]);
	});
	it('sanitizes nutrient input', () => {
		expect(
			sanitizeNutrients({ energy_kcal: '12', fat: -1, nope: 3, protein: NaN, fiber: 0 })
		).toEqual({
			energy_kcal: 12,
			fiber: 0
		});
	});
});
