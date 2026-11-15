import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { breakdown } from '#lib/server/insights.ts';
import { diffDays, isDate } from '#lib/dates.ts';
import { isNutrientKey } from '#lib/nutrients.ts';

/** whole history: string dates compare lexically, so these bound every YYYY-MM-DD */
const ALL_FROM = '0000-01-01';
const ALL_TO = '9999-12-31';

export const GET: RequestHandler = async ({ url }) => {
	const n = url.searchParams.get('nutrient') ?? 'energy_kcal';
	if (!isNutrientKey(n)) error(400, 'invalid nutrient');
	if (url.searchParams.get('scope') === 'all') return json(breakdown(ALL_FROM, ALL_TO, n));
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	if (!isDate(from) || !isDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > 370)
		error(400, 'invalid range');
	return json(breakdown(from, to, n));
};
