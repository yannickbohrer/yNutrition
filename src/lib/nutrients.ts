/**
 * Nutrient registry shared by server and client.
 * All food nutrient values are stored per 100 g (or 100 ml) of the food.
 * A missing key (or `null`) means "unknown" — never "zero".
 */

export const NUTRIENT_KEYS = [
	'energy_kcal',
	'energy_kj',
	'protein',
	'carbs',
	'sugars',
	'starch',
	'fiber',
	'fat',
	'sat_fat',
	'mono_fat',
	'poly_fat',
	'omega3_ala',
	'omega3_epa',
	'omega3_dha',
	'linoleic',
	'cholesterol',
	'salt',
	'sodium',
	'alcohol',
	'water',
	'vit_a',
	'retinol',
	'beta_carotene',
	'vit_b1',
	'vit_b2',
	'vit_b6',
	'vit_b12',
	'niacin',
	'folate',
	'pantothenic',
	'vit_c',
	'vit_d',
	'vit_e',
	'vit_k',
	'potassium',
	'chloride',
	'calcium',
	'magnesium',
	'phosphorus',
	'iron',
	'iodine',
	'zinc',
	'selenium',
	'caffeine'
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Per-100 g nutrient values. Missing key = unknown. */
export type Nutrients = Partial<Record<NutrientKey, number>>;

export type NutrientGroup = 'energy' | 'macro' | 'fat' | 'other' | 'vitamin' | 'mineral';

export interface NutrientDef {
	key: NutrientKey;
	unit: 'kcal' | 'kJ' | 'g' | 'mg' | 'µg';
	group: NutrientGroup;
	/** decimals for display at typical magnitudes */
	decimals: number;
	/** sub-nutrient (rendered indented, "davon …") */
	sub?: boolean;
}

export const NUTRIENTS: Record<NutrientKey, NutrientDef> = {
	energy_kcal: { key: 'energy_kcal', unit: 'kcal', group: 'energy', decimals: 0 },
	energy_kj: { key: 'energy_kj', unit: 'kJ', group: 'energy', decimals: 0 },
	protein: { key: 'protein', unit: 'g', group: 'macro', decimals: 1 },
	carbs: { key: 'carbs', unit: 'g', group: 'macro', decimals: 1 },
	sugars: { key: 'sugars', unit: 'g', group: 'macro', decimals: 1, sub: true },
	starch: { key: 'starch', unit: 'g', group: 'macro', decimals: 1, sub: true },
	fiber: { key: 'fiber', unit: 'g', group: 'macro', decimals: 1 },
	fat: { key: 'fat', unit: 'g', group: 'macro', decimals: 1 },
	sat_fat: { key: 'sat_fat', unit: 'g', group: 'fat', decimals: 1, sub: true },
	mono_fat: { key: 'mono_fat', unit: 'g', group: 'fat', decimals: 1, sub: true },
	poly_fat: { key: 'poly_fat', unit: 'g', group: 'fat', decimals: 1, sub: true },
	omega3_ala: { key: 'omega3_ala', unit: 'g', group: 'fat', decimals: 2 },
	omega3_epa: { key: 'omega3_epa', unit: 'g', group: 'fat', decimals: 2 },
	omega3_dha: { key: 'omega3_dha', unit: 'g', group: 'fat', decimals: 2 },
	linoleic: { key: 'linoleic', unit: 'g', group: 'fat', decimals: 2 },
	cholesterol: { key: 'cholesterol', unit: 'mg', group: 'fat', decimals: 0 },
	salt: { key: 'salt', unit: 'g', group: 'other', decimals: 2 },
	sodium: { key: 'sodium', unit: 'mg', group: 'mineral', decimals: 0 },
	alcohol: { key: 'alcohol', unit: 'g', group: 'other', decimals: 1 },
	water: { key: 'water', unit: 'g', group: 'other', decimals: 0 },
	caffeine: { key: 'caffeine', unit: 'mg', group: 'other', decimals: 0 },
	vit_a: { key: 'vit_a', unit: 'µg', group: 'vitamin', decimals: 0 },
	retinol: { key: 'retinol', unit: 'µg', group: 'vitamin', decimals: 0 },
	beta_carotene: { key: 'beta_carotene', unit: 'µg', group: 'vitamin', decimals: 0 },
	vit_b1: { key: 'vit_b1', unit: 'mg', group: 'vitamin', decimals: 2 },
	vit_b2: { key: 'vit_b2', unit: 'mg', group: 'vitamin', decimals: 2 },
	vit_b6: { key: 'vit_b6', unit: 'mg', group: 'vitamin', decimals: 2 },
	vit_b12: { key: 'vit_b12', unit: 'µg', group: 'vitamin', decimals: 2 },
	niacin: { key: 'niacin', unit: 'mg', group: 'vitamin', decimals: 1 },
	folate: { key: 'folate', unit: 'µg', group: 'vitamin', decimals: 0 },
	pantothenic: { key: 'pantothenic', unit: 'mg', group: 'vitamin', decimals: 2 },
	vit_c: { key: 'vit_c', unit: 'mg', group: 'vitamin', decimals: 1 },
	vit_d: { key: 'vit_d', unit: 'µg', group: 'vitamin', decimals: 1 },
	vit_e: { key: 'vit_e', unit: 'mg', group: 'vitamin', decimals: 1 },
	vit_k: { key: 'vit_k', unit: 'µg', group: 'vitamin', decimals: 1 },
	potassium: { key: 'potassium', unit: 'mg', group: 'mineral', decimals: 0 },
	chloride: { key: 'chloride', unit: 'mg', group: 'mineral', decimals: 0 },
	calcium: { key: 'calcium', unit: 'mg', group: 'mineral', decimals: 0 },
	magnesium: { key: 'magnesium', unit: 'mg', group: 'mineral', decimals: 0 },
	phosphorus: { key: 'phosphorus', unit: 'mg', group: 'mineral', decimals: 0 },
	iron: { key: 'iron', unit: 'mg', group: 'mineral', decimals: 1 },
	iodine: { key: 'iodine', unit: 'µg', group: 'mineral', decimals: 0 },
	zinc: { key: 'zinc', unit: 'mg', group: 'mineral', decimals: 1 },
	selenium: { key: 'selenium', unit: 'µg', group: 'mineral', decimals: 0 }
};

export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

/** Nutrients shown in the "main" nutrition panel (EU label order). */
export const LABEL_KEYS: NutrientKey[] = [
	'energy_kcal',
	'fat',
	'sat_fat',
	'carbs',
	'sugars',
	'fiber',
	'protein',
	'salt'
];

export const GROUP_ORDER: NutrientGroup[] = [
	'energy',
	'macro',
	'fat',
	'other',
	'vitamin',
	'mineral'
];

export function isNutrientKey(k: string): k is NutrientKey {
	return (NUTRIENT_KEYS as readonly string[]).includes(k);
}

/** Keep only known keys with finite, non-negative numbers. */
export function sanitizeNutrients(input: unknown): Nutrients {
	const out: Nutrients = {};
	if (!input || typeof input !== 'object') return out;
	for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
		if (!isNutrientKey(k)) continue;
		const n = typeof v === 'string' ? Number(v) : v;
		if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
	}
	return out;
}
