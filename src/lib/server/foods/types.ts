import type { Nutrients } from '../../nutrients';
import type { Basis, FoodSourceId } from '../../types';

/** A food as produced by a source adapter, before it is stored in the local DB. */
export interface NormalizedFood {
	source: FoodSourceId;
	sourceId: string;
	nameDe: string | null;
	nameEn: string | null;
	brand: string | null;
	barcode: string | null;
	category: string | null;
	basis: Basis;
	nutrients: Nutrients;
	servingSize: string | null;
	servingQuantity: number | null;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class RateLimitedError extends Error {
	constructor(source: string) {
		super(`${source}: rate limit reached`);
		this.name = 'RateLimitedError';
	}
}

/** Common interface for remote food databases (Open Food Facts, USDA, …). */
export interface FoodSource {
	readonly id: FoodSourceId;
	/** whether the source is configured/enabled */
	enabled(): boolean;
	/** free-text search */
	search?(query: string, opts?: { lang?: 'de' | 'en'; limit?: number }): Promise<NormalizedFood[]>;
	/** barcode lookup; resolves null if unknown */
	lookupBarcode?(barcode: string): Promise<NormalizedFood | null>;
	/** URL for attribution / "view source" */
	sourceUrl?(food: { sourceId: string; barcode: string | null }): string | null;
}
