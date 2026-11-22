import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addWeight, weightsBetween, weightsPage } from '#lib/server/weights.ts';
import { handle, readJson } from '#lib/server/http.ts';
import { isDate } from '#lib/dates.ts';

/**
 * `?from&to`: every weigh-in in that range, oldest first (for the chart).
 * Otherwise a newest-first page: `?before=<date>&beforeId=<id>&limit=<n>` continues after a cursor.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams;
	if (q.has('from') || q.has('to')) {
		const from = q.get('from') ?? '';
		const to = q.get('to') ?? '';
		if (!isDate(from) || !isDate(to) || from > to) error(400, 'invalid range');
		return json(weightsBetween(from, to));
	}
	const before = q.get('before');
	const beforeId = Number(q.get('beforeId'));
	if (before !== null && (!isDate(before) || !Number.isInteger(beforeId)))
		error(400, 'invalid cursor');
	const limit = Number(q.get('limit') ?? 50) || 50;
	return json(weightsPage(before ? { date: before, id: beforeId } : null, limit));
};

export const POST: RequestHandler = async (event) => {
	const b = await readJson<{ date: string; kg: number; note?: string }>(event);
	return json(
		handle(() => addWeight({ date: b.date, kg: Number(b.kg), note: b.note })),
		{ status: 201 }
	);
};
