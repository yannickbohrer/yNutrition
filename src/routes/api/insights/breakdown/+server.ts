import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { breakdown } from '#lib/server/insights.ts';
import { diffDays, isDate } from '#lib/dates.ts';
import { isNutrientKey } from '#lib/nutrients.ts';

export const GET: RequestHandler = async ({ url }) => {
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const n = url.searchParams.get('nutrient') ?? 'energy_kcal';
	if (!isDate(from) || !isDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > 370)
		error(400, 'invalid range');
	if (!isNutrientKey(n)) error(400, 'invalid nutrient');
	return json(breakdown(from, to, n));
};
