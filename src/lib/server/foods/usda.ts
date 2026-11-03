/**
 * USDA FoodData Central adapter (optional, enabled only with USDA_API_KEY).
 * Data is CC0; FDC asks to be cited as source. Limit: 1,000 req/h per key — we cap at 300/h.
 */
import { completeNutrients } from '../../nutrition';
import type { NutrientKey, Nutrients } from '../../nutrients';
import { createLimiter, type Limiter } from '../ratelimit';
import { RateLimitedError, type FetchLike, type FoodSource, type NormalizedFood } from './types';

/** FDC nutrient number → our key. Units already match (G, MG, UG, KCAL, kJ). */
const USDA_MAP: Record<string, NutrientKey> = {
	'208': 'energy_kcal',
	'957': 'energy_kcal', // Atwater general (Foundation foods)
	'958': 'energy_kcal', // Atwater specific
	'268': 'energy_kj',
	'203': 'protein',
	'205': 'carbs',
	'269': 'sugars',
	'209': 'starch',
	'291': 'fiber',
	'204': 'fat',
	'606': 'sat_fat',
	'645': 'mono_fat',
	'646': 'poly_fat',
	'619': 'omega3_ala',
	'629': 'omega3_epa',
	'621': 'omega3_dha',
	'618': 'linoleic',
	'601': 'cholesterol',
	'307': 'sodium',
	'221': 'alcohol',
	'255': 'water',
	'262': 'caffeine',
	'320': 'vit_a',
	'319': 'retinol',
	'321': 'beta_carotene',
	'404': 'vit_b1',
	'405': 'vit_b2',
	'415': 'vit_b6',
	'418': 'vit_b12',
	'406': 'niacin',
	'435': 'folate',
	'417': 'folate',
	'410': 'pantothenic',
	'401': 'vit_c',
	'328': 'vit_d',
	'323': 'vit_e',
	'430': 'vit_k',
	'306': 'potassium',
	'301': 'calcium',
	'304': 'magnesium',
	'305': 'phosphorus',
	'303': 'iron',
	'309': 'zinc',
	'317': 'selenium'
};

interface UsdaNutrient {
	nutrientNumber?: string;
	nutrientName?: string;
	unitName?: string;
	value?: number;
}
interface UsdaFood {
	fdcId: number;
	description: string;
	dataType?: string;
	brandOwner?: string;
	brandName?: string;
	gtinUpc?: string;
	foodCategory?: string;
	servingSize?: number;
	servingSizeUnit?: string;
	householdServingFullText?: string;
	foodNutrients?: UsdaNutrient[];
}

export function usdaNutrients(list: UsdaNutrient[] | undefined): Nutrients {
	const out: Nutrients = {};
	for (const n of list ?? []) {
		const key = n.nutrientNumber ? USDA_MAP[n.nutrientNumber] : undefined;
		if (!key || out[key] !== undefined) continue;
		if (typeof n.value !== 'number' || !Number.isFinite(n.value) || n.value < 0) continue;
		if (key === 'energy_kj' && n.unitName && n.unitName.toUpperCase() !== 'KJ') continue;
		if (key === 'energy_kcal' && n.unitName && n.unitName.toUpperCase() !== 'KCAL') continue;
		out[key] = n.value;
	}
	return completeNutrients(out);
}

export function normalizeUsdaFood(f: UsdaFood): NormalizedFood {
	const unit = (f.servingSizeUnit ?? '').toLowerCase();
	const servingQuantity =
		f.servingSize && (unit === 'g' || unit === 'ml' || unit === 'grm' || unit === 'mlt')
			? f.servingSize
			: null;
	const name = f.description.replace(/\s+/g, ' ').trim();
	return {
		source: 'usda',
		sourceId: String(f.fdcId),
		nameDe: null,
		nameEn: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
		brand: f.brandName ?? f.brandOwner ?? null,
		barcode: f.gtinUpc ?? null,
		category: f.foodCategory ?? null,
		basis: unit === 'ml' || unit === 'mlt' ? 'ml' : 'g',
		nutrients: usdaNutrients(f.foodNutrients),
		servingSize: f.householdServingFullText ?? null,
		servingQuantity
	};
}

export interface UsdaOptions {
	apiKey: string;
	baseUrl: string;
	fetch?: FetchLike;
	limiter?: Limiter;
	timeoutMs?: number;
}

export class UsdaSource implements FoodSource {
	readonly id = 'usda' as const;
	private readonly limiter: Limiter;
	private readonly fetch: FetchLike;

	constructor(private readonly opts: UsdaOptions) {
		this.fetch = opts.fetch ?? ((i, init) => fetch(i, init));
		this.limiter = opts.limiter ?? createLimiter({ limit: 300, windowMs: 3_600_000 });
	}

	enabled() {
		return Boolean(this.opts.apiKey);
	}

	async search(query: string, opts: { limit?: number } = {}): Promise<NormalizedFood[]> {
		if (!this.enabled() || !query.trim()) return [];
		if (!this.limiter.take()) throw new RateLimitedError('USDA');
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 8000);
		try {
			const res = await this.fetch(
				`${this.opts.baseUrl}/foods/search?api_key=${encodeURIComponent(this.opts.apiKey)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify({
						query: query.trim(),
						dataType: ['Foundation', 'SR Legacy'],
						pageSize: opts.limit ?? 10
					}),
					signal: ctrl.signal
				}
			);
			if (res.status === 429) throw new RateLimitedError('USDA');
			if (!res.ok) throw new Error(`USDA: HTTP ${res.status}`);
			const body = (await res.json()) as { foods?: UsdaFood[] };
			return (body.foods ?? []).map(normalizeUsdaFood);
		} finally {
			clearTimeout(timer);
		}
	}

	sourceUrl(food: { sourceId: string }) {
		return `https://fdc.nal.usda.gov/food-details/${encodeURIComponent(food.sourceId)}/nutrients`;
	}
}
