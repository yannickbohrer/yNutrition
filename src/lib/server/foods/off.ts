/**
 * Open Food Facts adapter.
 *
 * Usage rules (https://openfoodfacts.github.io/openfoodfacts-server/api/):
 *  - custom User-Agent "AppName/Version (ContactEmail)"
 *  - product reads: 15 req/min/IP, search: 10 req/min/IP, no search-as-you-type
 *  - data is ODbL (attribution + link to product page), images CC BY-SA (we don't display images)
 * We stay below the limits with local limiters, cache everything locally, and only search online
 * on explicit user action.
 */
import { completeNutrients } from '../../nutrition';
import type { NutrientKey, Nutrients } from '../../nutrients';
import { createLimiter, type Limiter } from '../ratelimit';
import { RateLimitedError, type FetchLike, type FoodSource, type NormalizedFood } from './types';

/** OFF nutriment key → [our key, factor from OFF base unit (g) to our unit] */
const OFF_MAP: [string, NutrientKey, number][] = [
	['energy-kcal', 'energy_kcal', 1],
	['energy-kj', 'energy_kj', 1],
	['proteins', 'protein', 1],
	['carbohydrates', 'carbs', 1],
	['sugars', 'sugars', 1],
	['starch', 'starch', 1],
	['fiber', 'fiber', 1],
	['fat', 'fat', 1],
	['saturated-fat', 'sat_fat', 1],
	['monounsaturated-fat', 'mono_fat', 1],
	['polyunsaturated-fat', 'poly_fat', 1],
	['alpha-linolenic-acid', 'omega3_ala', 1],
	['eicosapentaenoic-acid', 'omega3_epa', 1],
	['docosahexaenoic-acid', 'omega3_dha', 1],
	['linoleic-acid', 'linoleic', 1],
	['cholesterol', 'cholesterol', 1000],
	['salt', 'salt', 1],
	['sodium', 'sodium', 1000],
	['vitamin-a', 'vit_a', 1e6],
	['beta-carotene', 'beta_carotene', 1e6],
	['vitamin-b1', 'vit_b1', 1000],
	['vitamin-b2', 'vit_b2', 1000],
	['vitamin-b6', 'vit_b6', 1000],
	['vitamin-b12', 'vit_b12', 1e6],
	['vitamin-pp', 'niacin', 1000],
	['vitamin-b9', 'folate', 1e6],
	['folates', 'folate', 1e6],
	['pantothenic-acid', 'pantothenic', 1000],
	['vitamin-c', 'vit_c', 1000],
	['vitamin-d', 'vit_d', 1e6],
	['vitamin-e', 'vit_e', 1000],
	['vitamin-k', 'vit_k', 1e6],
	['potassium', 'potassium', 1000],
	['chloride', 'chloride', 1000],
	['calcium', 'calcium', 1000],
	['magnesium', 'magnesium', 1000],
	['phosphorus', 'phosphorus', 1000],
	['iron', 'iron', 1000],
	['iodine', 'iodine', 1e6],
	['zinc', 'zinc', 1000],
	['selenium', 'selenium', 1e6],
	['caffeine', 'caffeine', 1000]
];

export const OFF_FIELDS = [
	'code',
	'product_name',
	'product_name_de',
	'product_name_en',
	'generic_name_de',
	'brands',
	'quantity',
	'serving_size',
	'serving_quantity',
	'nutriments',
	'categories_tags',
	'lang'
].join(',');

type OffProduct = Record<string, unknown> & {
	code?: string;
	nutriments?: Record<string, unknown>;
};

const num = (v: unknown): number | undefined => {
	const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
	return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const str = (v: unknown): string | null => {
	if (Array.isArray(v)) return v.length ? str(v[0]) : null;
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s ? s : null;
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function offNutrients(nutriments: Record<string, unknown> | undefined): Nutrients {
	const out: Nutrients = {};
	if (!nutriments) return out;
	for (const [offKey, key, factor] of OFF_MAP) {
		if (out[key] !== undefined) continue;
		const v = num(nutriments[`${offKey}_100g`]);
		if (v !== undefined) out[key] = round(v * factor);
	}
	// OFF "energy_100g" is kJ when energy-kj is absent
	if (out.energy_kj === undefined) {
		const e = num(nutriments['energy_100g']);
		if (e !== undefined) out.energy_kj = e;
	}
	// alcohol is reported in % vol → g/100 ml (ethanol density 0.789)
	const alc = num(nutriments['alcohol_100g']);
	if (alc !== undefined) out.alcohol = round(alc * 0.789);
	return completeNutrients(out);
}

function isLiquid(p: OffProduct): boolean {
	const q = str(p.quantity) ?? '';
	if (/\d\s*(ml|cl|dl|l|liter|litre)\b/i.test(q)) return true;
	const cats = Array.isArray(p.categories_tags) ? (p.categories_tags as string[]) : [];
	return cats.includes('en:beverages') && !cats.includes('en:dried-products-to-be-rehydrated');
}

export function normalizeOffProduct(p: OffProduct): NormalizedFood | null {
	const code = str(p.code);
	if (!code) return null;
	const nameDe = str(p.product_name_de) ?? str(p.generic_name_de);
	const nameEn = str(p.product_name_en);
	const anyName = nameDe ?? str(p.product_name) ?? nameEn;
	if (!anyName) return null;
	const brand = str(p.brands)?.split(',')[0]?.trim() ?? null;
	const servingQuantity = num(p.serving_quantity) ?? null;
	return {
		source: 'off',
		sourceId: code,
		nameDe: nameDe ?? (p.lang === 'en' ? null : str(p.product_name)) ?? anyName,
		nameEn: nameEn ?? (p.lang === 'en' ? str(p.product_name) : null),
		brand,
		barcode: code,
		category: null,
		basis: isLiquid(p) ? 'ml' : 'g',
		nutrients: offNutrients(p.nutriments as Record<string, unknown> | undefined),
		servingSize: str(p.serving_size),
		servingQuantity: servingQuantity && servingQuantity > 0 ? servingQuantity : null
	};
}

export interface OffOptions {
	baseUrl: string;
	searchUrl: string;
	userAgent: string;
	enabled?: boolean;
	fetch?: FetchLike;
	productLimiter?: Limiter;
	searchLimiter?: Limiter;
	timeoutMs?: number;
}

export class OpenFoodFactsSource implements FoodSource {
	readonly id = 'off' as const;
	private readonly productLimiter: Limiter;
	private readonly searchLimiter: Limiter;
	private readonly fetch: FetchLike;

	constructor(private readonly opts: OffOptions) {
		this.fetch = opts.fetch ?? ((i, init) => fetch(i, init));
		// stay safely below the documented 15 product / 10 search req/min
		this.productLimiter = opts.productLimiter ?? createLimiter({ limit: 12, windowMs: 60_000 });
		this.searchLimiter = opts.searchLimiter ?? createLimiter({ limit: 8, windowMs: 60_000 });
	}

	enabled() {
		return this.opts.enabled !== false;
	}

	private async get(url: string): Promise<Response> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 8000);
		try {
			return await this.fetch(url, {
				headers: { 'User-Agent': this.opts.userAgent, Accept: 'application/json' },
				signal: ctrl.signal
			});
		} finally {
			clearTimeout(timer);
		}
	}

	async lookupBarcode(barcode: string): Promise<NormalizedFood | null> {
		if (!this.productLimiter.take()) throw new RateLimitedError('Open Food Facts');
		const url = `${this.opts.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}?fields=${OFF_FIELDS}`;
		const res = await this.get(url);
		if (res.status === 404) return null;
		if (res.status === 429 || res.status === 503) throw new RateLimitedError('Open Food Facts');
		if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
		const body = (await res.json()) as { status?: number; product?: OffProduct };
		if (!body.product || body.status === 0) return null;
		return normalizeOffProduct({ code: barcode, ...body.product });
	}

	async search(
		query: string,
		opts: { lang?: 'de' | 'en'; limit?: number } = {}
	): Promise<NormalizedFood[]> {
		const q = query.trim();
		if (!q) return [];
		if (!this.searchLimiter.take()) throw new RateLimitedError('Open Food Facts');
		const params = new URLSearchParams({
			q: `${q} countries_tags:"en:switzerland"`,
			langs: opts.lang === 'en' ? 'en,de' : 'de,en',
			page_size: String(opts.limit ?? 20),
			fields: OFF_FIELDS
		});
		const res = await this.get(`${this.opts.searchUrl}/search?${params}`);
		if (res.status === 429 || res.status === 503) throw new RateLimitedError('Open Food Facts');
		if (!res.ok) throw new Error(`Open Food Facts search: HTTP ${res.status}`);
		const body = (await res.json()) as { hits?: OffProduct[] };
		const out: NormalizedFood[] = [];
		for (const hit of body.hits ?? []) {
			const f = normalizeOffProduct(hit);
			if (f) out.push(f);
		}
		return out;
	}

	sourceUrl(food: { sourceId: string }) {
		return `https://world.openfoodfacts.org/product/${encodeURIComponent(food.sourceId)}`;
	}
}
