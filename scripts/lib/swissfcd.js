// @ts-check
/**
 * Pure helpers for the Swiss Food Composition Database (naehrwertdaten.ch, FSVO/BLV).
 * Data source: Swiss Food Composition Database, Federal Food Safety and Veterinary Office FSVO.
 */

/** English column header (prefix) → internal nutrient key. Order matters: first match wins. */
export const HEADER_MAP = [
	[/^Energy, kilojoules/i, 'energy_kj'],
	[/^Energy, kilocalories/i, 'energy_kcal'],
	[/^Fat, total/i, 'fat'],
	[/^Fatty acids, saturated/i, 'sat_fat'],
	[/^Fatty acids, monounsaturated/i, 'mono_fat'],
	[/^Fatty acids, polyunsaturated/i, 'poly_fat'],
	[/^Linoleic acid/i, 'linoleic'],
	[/^Alpha-linolenic acid/i, 'omega3_ala'],
	[/^Eicosapentaenoic acid/i, 'omega3_epa'],
	[/^Docosahexaenoic acid/i, 'omega3_dha'],
	[/^Cholesterol/i, 'cholesterol'],
	[/^Carbohydrates, available/i, 'carbs'],
	[/^Sugars/i, 'sugars'],
	[/^Starch/i, 'starch'],
	[/^Dietary fibres/i, 'fiber'],
	[/^Protein/i, 'protein'],
	[/^Salt \(NaCl\)/i, 'salt'],
	[/^Alcohol/i, 'alcohol'],
	[/^Water/i, 'water'],
	[/^Vitamin A activity, RE/i, 'vit_a'],
	[/^Retinol/i, 'retinol'],
	[/^Beta-carotene \(/i, 'beta_carotene'],
	[/^Vitamin B1 /i, 'vit_b1'],
	[/^Vitamin B2 /i, 'vit_b2'],
	[/^Vitamin B6 /i, 'vit_b6'],
	[/^Vitamin B12 /i, 'vit_b12'],
	[/^Niacin \(/i, 'niacin'],
	[/^Folate/i, 'folate'],
	[/^Pantothenic acid/i, 'pantothenic'],
	[/^Vitamin C /i, 'vit_c'],
	[/^Vitamin D /i, 'vit_d'],
	[/^Vitamin E /i, 'vit_e'],
	[/^Potassium/i, 'potassium'],
	[/^Sodium/i, 'sodium'],
	[/^Chloride/i, 'chloride'],
	[/^Calcium/i, 'calcium'],
	[/^Magnesium/i, 'magnesium'],
	[/^Phosphorus/i, 'phosphorus'],
	[/^Iron/i, 'iron'],
	[/^Iodide/i, 'iodine'],
	[/^Zinc/i, 'zinc'],
	[/^Selenium/i, 'selenium']
];

/**
 * Parse a cell value.
 *  - number → number
 *  - "n.d." / "k.A." / "-" / empty → null (unknown)
 *  - "tr." / "Sp." (traces) → 0
 *  - "<x" (below detection limit) → 0
 * @param {unknown} v
 * @returns {number | null}
 */
export function parseValue(v) {
	if (v === null || v === undefined) return null;
	if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
	if (typeof v === 'object') {
		// exceljs rich values / formula results
		const o = /** @type {any} */ (v);
		if ('result' in o) return parseValue(o.result);
		if ('richText' in o)
			return parseValue(o.richText.map((/** @type {any} */ r) => r.text).join(''));
		return null;
	}
	const s = String(v).trim().toLowerCase();
	if (!s || s === 'n.d.' || s === 'k.a.' || s === 'n.a.' || s === '-' || s === 'n.c.') return null;
	if (s === 'tr.' || s === 'sp.' || s === 'tr') return 0;
	if (s.startsWith('<')) return 0;
	const n = Number(s.replace(',', '.'));
	return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Map a header row to { key → column index }.
 * @param {unknown[]} header
 * @returns {{ id: number, name: number, synonyms: number, category: number, density: number, nutrients: Record<string, number> }}
 */
export function mapHeader(header) {
	/** @type {Record<string, number>} */
	const nutrients = {};
	let id = -1,
		name = -1,
		synonyms = -1,
		category = -1,
		density = -1;
	header.forEach((h, i) => {
		if (typeof h !== 'string') return;
		const t = h.trim();
		if (t === 'ID' && id < 0) id = i;
		else if (t === 'Name' && name < 0) name = i;
		else if (t === 'Synonyms' && synonyms < 0) synonyms = i;
		else if (t === 'Category' && category < 0) category = i;
		else if (t === 'Density' && density < 0) density = i;
		else {
			for (const [re, key] of HEADER_MAP) {
				if (
					/** @type {RegExp} */ (re).test(t) &&
					nutrients[/** @type {string} */ (key)] === undefined
				) {
					nutrients[/** @type {string} */ (key)] = i;
					break;
				}
			}
		}
	});
	return { id, name, synonyms, category, density, nutrients };
}

/**
 * Extract a normalized food from a data row.
 * @param {unknown[]} row
 * @param {ReturnType<typeof mapHeader>} cols
 */
export function rowToNutrients(row, cols) {
	/** @type {Record<string, number>} */
	const out = {};
	for (const [key, idx] of Object.entries(cols.nutrients)) {
		const v = parseValue(row[idx]);
		if (v !== null) out[key] = v;
	}
	return out;
}

/** @param {unknown} v */
export function cellText(v) {
	if (v === null || v === undefined) return null;
	if (typeof v === 'object') {
		const o = /** @type {any} */ (v);
		if ('richText' in o)
			return (
				o.richText
					.map((/** @type {any} */ r) => r.text)
					.join('')
					.trim() || null
			);
		if ('result' in o) return cellText(o.result);
		if ('text' in o) return String(o.text).trim() || null;
	}
	const s = String(v).trim();
	return s || null;
}

/** Swiss orthography: never "ß". @param {string | null} s */
export function swissify(s) {
	return s === null ? null : s.replace(/ß/g, 'ss');
}
