import type { MacroSplit } from './types';

/** kcal per gram (Atwater general factors), as used for the macro check on the targets page. */
export const MACRO_KCAL = { protein: 4, carbs: 4, fat: 9 } as const;
export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;

/** Whole grams for each macro from its share of the kcal target. Never below 1 g. */
export function gramsFromSplit(kcal: number, split: MacroSplit): MacroSplit {
	const g = (k: (typeof MACRO_KEYS)[number]) =>
		Math.max(1, Math.round((kcal * split[k]) / 100 / MACRO_KCAL[k]));
	return { protein: g('protein'), carbs: g('carbs'), fat: g('fat') };
}

/** Whole-percent shares of the kcal target that the given grams make up. */
export function splitFromGrams(kcal: number, grams: MacroSplit): MacroSplit {
	const p = (k: (typeof MACRO_KEYS)[number]) =>
		kcal > 0 ? Math.round(((grams[k] || 0) * MACRO_KCAL[k] * 100) / kcal) : 0;
	return { protein: p('protein'), carbs: p('carbs'), fat: p('fat') };
}

/** A valid split: every share a whole percent from 1 to 100. Anything else → `null`. */
export function sanitizeSplit(input: unknown): MacroSplit | null {
	if (!input || typeof input !== 'object') return null;
	const out = {} as MacroSplit;
	for (const k of MACRO_KEYS) {
		const n = Math.round(Number((input as Record<string, unknown>)[k]));
		if (!Number.isFinite(n) || n < 1 || n > 100) return null;
		out[k] = n;
	}
	return out;
}
