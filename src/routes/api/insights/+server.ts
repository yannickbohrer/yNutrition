import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allTimeRange, insights, type Bucket } from '#lib/server/insights.ts';
import { diffDays, isDate, todayLocal } from '#lib/dates.ts';

/** days a request may span per bucket (the whole history only via `scope=all`) */
const MAX_SPAN: Record<Bucket, number> = { day: 370, month: 3700, year: 36_600 };

export const GET: RequestHandler = async ({ url }) => {
	if (url.searchParams.get('scope') === 'all') {
		const r = allTimeRange(todayLocal());
		return json(insights(r.from, r.to, r.bucket));
	}
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const b = url.searchParams.get('bucket');
	const bucket: Bucket = b === 'month' || b === 'year' ? b : 'day';
	if (
		!isDate(from) ||
		!isDate(to) ||
		diffDays(from, to) < 0 ||
		diffDays(from, to) > MAX_SPAN[bucket]
	)
		error(400, 'invalid range');
	return json(insights(from, to, bucket));
};
