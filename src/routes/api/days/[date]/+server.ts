import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDay } from '#lib/server/log.ts';
import { isDate } from '#lib/dates.ts';

export const GET: RequestHandler = async ({ params }) => {
	if (!isDate(params.date)) error(400, 'invalid date');
	return json(getDay(params.date));
};
