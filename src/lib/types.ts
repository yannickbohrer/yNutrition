/** DTOs shared between server (API) and client. */
import type { NutrientKey, Nutrients } from './nutrients';

export type FoodSourceId = 'swissfcd' | 'off' | 'usda' | 'custom' | 'recipe';
export type Basis = 'g' | 'ml';
export type Lang = 'de' | 'en';
export type EnergyUnit = 'kcal' | 'kJ';

export type PortionKind = 'user' | 'recipe' | 'serving' | 'seed' | 'default';

export interface Portion {
	label: string;
	amount: number;
	kind: PortionKind;
	/** id of a user-defined portion (food_portions row) */
	id?: number;
	default?: boolean;
}

export interface FoodSummary {
	id: number;
	source: FoodSourceId;
	name: string;
	brand: string | null;
	basis: Basis;
	kcal: number | null;
	favorite: boolean;
	/** core nutrients (kcal, protein, carbs, fat) incomplete */
	incomplete: boolean;
	barcode?: string | null;
}

export interface FoodDTO extends FoodSummary {
	sourceId: string;
	nameDe: string | null;
	nameEn: string | null;
	category: string | null;
	barcode: string | null;
	nutrients: Nutrients;
	partial: NutrientKey[];
	portions: Portion[];
	defaultAmount: number;
	lastAmount: number | null;
	/** link to the original data source (e.g. OFF product page), for attribution */
	sourceUrl: string | null;
	servingSize: string | null;
	editable: boolean;
	deleted: boolean;
}

export interface EntryDTO {
	id: number;
	date: string;
	time: string;
	foodId: number | null;
	name: string;
	brand: string | null;
	basis: Basis;
	amount: number;
	/** scaled to `amount` */
	nutrients: Nutrients;
	per100: Nutrients;
	partial: NutrientKey[];
	source: FoodSourceId | null;
}

export interface NutrientTarget {
	/** lower target (goal) */
	min?: number | null;
	/** upper limit */
	max?: number | null;
}

export interface Targets {
	energy_kcal: number;
	protein: number;
	carbs: number;
	fat: number;
	/** optional extra targets / limits */
	extra: Partial<Record<NutrientKey, NutrientTarget>>;
}

export interface UserSettings {
	lang: Lang;
	energyUnit: EnergyUnit;
	showKj: boolean;
	targets: Targets;
}

export interface DaySummary {
	date: string;
	entries: EntryDTO[];
	totals: Nutrients;
	missing: Partial<Record<NutrientKey, number>>;
	count: number;
}

export interface WeightDTO {
	id: number;
	date: string;
	kg: number;
	note: string | null;
}

export interface SearchSections {
	query: string;
	mine: FoodSummary[];
	local: FoodSummary[];
}

export interface OnlineSearchResult {
	query: string;
	results: FoodSummary[];
	/** sources that were queried */
	sources: FoodSourceId[];
	/** true if served from cache */
	cached: boolean;
	/** rate limited — try later */
	limited?: boolean;
	error?: string;
}

export interface BarcodeResult {
	barcode: string;
	food: FoodDTO | null;
	limited?: boolean;
	error?: string;
}

export interface RecipeItemDTO {
	foodId: number;
	name: string;
	basis: Basis;
	amount: number;
	kcal: number | null;
}

export interface RecipeDTO {
	id: number;
	name: string;
	servings: number;
	cookedWeight: number | null;
	notes: string | null;
	items: RecipeItemDTO[];
	per100: Nutrients;
	perServing: Nutrients;
	total: Nutrients;
	rawWeight: number;
	finalWeight: number;
	servingWeight: number;
	partial: NutrientKey[];
}

export interface PasskeyDTO {
	id: string;
	name: string;
	createdAt: number;
	lastUsedAt: number | null;
	deviceType: string | null;
	backedUp: boolean;
	current?: boolean;
}

export interface ApiError {
	message: string;
	code?: string;
}
