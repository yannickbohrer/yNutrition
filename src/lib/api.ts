/** Typed client for the JSON API. */
import type {
	BarcodeResult,
	DaySummary,
	EntryDTO,
	FoodDTO,
	FoodSummary,
	OnlineSearchResult,
	PasskeyDTO,
	RecipeDTO,
	SearchSections,
	UserSettings,
	WeightDTO
} from './types';
import type { InsightsDTO } from './server/insights';
import type { NutrientKey } from './nutrients';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function req<T>(
	method: string,
	url: string,
	body?: unknown,
	signal?: AbortSignal
): Promise<T> {
	const hasBody = method !== 'GET' && method !== 'HEAD';
	const res = await fetch(url, {
		method,
		// always JSON for mutations (SvelteKit's CSRF guard rejects body-less cross-origin-looking requests)
		headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
		body: hasBody ? JSON.stringify(body ?? {}) : undefined,
		credentials: 'same-origin',
		signal
	});
	if (res.status === 401 && typeof location !== 'undefined' && !url.startsWith('/api/auth/')) {
		location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
	}
	if (!res.ok) {
		let msg = res.statusText;
		try {
			msg = ((await res.json()) as { message?: string }).message ?? msg;
		} catch {
			/* ignore */
		}
		throw new ApiError(res.status, msg);
	}
	return (await res.json()) as T;
}

export interface DeletedRow {
	ok: true;
	row: Record<string, unknown> & { id: number };
}

export interface Suggestions {
	favorites: FoodSummary[];
	recent: FoodSummary[];
	frequent: FoodSummary[];
}

export interface Breakdown {
	from: string;
	to: string;
	nutrient: NutrientKey;
	total: number;
	items: { key: string; label: string; value: number; share: number }[];
	entries: number;
	missing: number;
}

export const api = {
	day: (date: string) => req<DaySummary>('GET', `/api/days/${date}`),
	addEntry: (b: { foodId: number; amount: number; date: string; time: string }) =>
		req<EntryDTO>('POST', '/api/entries', b),
	updateEntry: (id: number, b: { amount?: number; date?: string; time?: string }) =>
		req<EntryDTO>('PATCH', `/api/entries/${id}`, b),
	deleteEntry: (id: number) => req<DeletedRow>('DELETE', `/api/entries/${id}`),
	restoreEntry: (row: DeletedRow['row']) => req<EntryDTO>('POST', '/api/entries/restore', { row }),
	copyEntries: (ids: number[], date: string, time: string | null = null) =>
		req<EntryDTO[]>('POST', '/api/entries/copy', { ids, date, time }),

	search: (q: string, signal?: AbortSignal) =>
		req<SearchSections>('GET', `/api/foods/search?q=${encodeURIComponent(q)}`, undefined, signal),
	suggestions: () => req<Suggestions>('GET', '/api/foods/suggestions'),
	online: (q: string, signal?: AbortSignal) =>
		req<OnlineSearchResult>(
			'GET',
			`/api/foods/online?q=${encodeURIComponent(q)}`,
			undefined,
			signal
		),
	barcode: (code: string) =>
		req<BarcodeResult>('GET', `/api/foods/barcode/${encodeURIComponent(code)}`),
	food: (id: number) => req<FoodDTO>('GET', `/api/foods/${id}`),
	createFood: (b: unknown) => req<FoodDTO>('POST', '/api/foods', b),
	updateFood: (id: number, b: unknown) => req<FoodDTO>('PUT', `/api/foods/${id}`, b),
	deleteFood: (id: number) => req<{ ok: true }>('DELETE', `/api/foods/${id}`),
	favorite: (id: number, on: boolean) =>
		req<{ ok: true }>('PUT', `/api/foods/${id}/favorite`, { on }),
	addPortion: (id: number, label: string, amount: number) =>
		req<FoodDTO>('POST', `/api/foods/${id}/portions`, { label, amount }),
	deletePortion: (id: number, pid: number) =>
		req<FoodDTO>('DELETE', `/api/foods/${id}/portions/${pid}`),

	recipes: () => req<FoodSummary[]>('GET', '/api/recipes'),
	recipe: (id: number) => req<RecipeDTO>('GET', `/api/recipes/${id}`),
	createRecipe: (b: unknown) => req<RecipeDTO>('POST', '/api/recipes', b),
	updateRecipe: (id: number, b: unknown) => req<RecipeDTO>('PUT', `/api/recipes/${id}`, b),
	deleteRecipe: (id: number) => req<{ ok: true }>('DELETE', `/api/recipes/${id}`),

	weights: () => req<WeightDTO[]>('GET', '/api/weights'),
	addWeight: (b: { date: string; kg: number; note?: string }) =>
		req<WeightDTO>('POST', '/api/weights', b),
	deleteWeight: (id: number) => req<{ ok: true }>('DELETE', `/api/weights/${id}`),

	insights: (from: string, to: string) =>
		req<InsightsDTO>('GET', `/api/insights?from=${from}&to=${to}`),
	breakdown: (from: string, to: string, nutrient: NutrientKey) =>
		req<Breakdown>('GET', `/api/insights/breakdown?from=${from}&to=${to}&nutrient=${nutrient}`),

	settings: (patch: Partial<UserSettings>) => req<UserSettings>('PATCH', '/api/settings', patch),
	importBackup: (data: unknown) =>
		req<{ ok: true; entries: number; weights: number; foods: number; recipes: number }>(
			'POST',
			'/api/import',
			data
		),

	passkeys: () => req<PasskeyDTO[]>('GET', '/api/passkeys'),
	renamePasskey: (id: string, name: string) =>
		req<{ ok: true }>('PATCH', `/api/passkeys/${encodeURIComponent(id)}`, { name }),
	deletePasskey: (id: string) =>
		req<{ ok: true }>('DELETE', `/api/passkeys/${encodeURIComponent(id)}`),

	auth: {
		registerOptions: (token?: string) =>
			req<unknown>('POST', '/api/auth/register/options', { token }),
		registerVerify: (response: unknown, name?: string) =>
			req<{ ok: true }>('POST', '/api/auth/register/verify', { response, name }),
		loginOptions: () => req<unknown>('POST', '/api/auth/login/options', {}),
		loginVerify: (response: unknown) =>
			req<{ ok: true }>('POST', '/api/auth/login/verify', { response }),
		logout: () => req<{ ok: true }>('POST', '/api/auth/logout', {})
	}
};
