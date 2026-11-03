import type { PageServerLoad } from './$types';
import { getDay } from '#lib/server/log.ts';
import { isDate, todayLocal } from '#lib/dates.ts';
import { config } from '#lib/server/config.ts';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('date');
	const date = isDate(q) ? q : todayLocal(config.timezone);
	return { day: getDay(date) };
};
