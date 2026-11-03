import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { insights } from '#lib/server/insights.ts';
import { diffDays, isDate } from '#lib/dates.ts';

export const GET: RequestHandler = async ({ url }) => {
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	if (!isDate(from) || !isDate(to) || diffDays(from, to) < 0 || diffDays(from, to) > 370)
		error(400, 'invalid range');
	return json(insights(from, to));
};
