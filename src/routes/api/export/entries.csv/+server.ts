import type { RequestHandler } from './$types';
import { entriesCsv } from '#lib/server/backup.ts';
import { todayLocal } from '#lib/dates.ts';

export const GET: RequestHandler = async () =>
	new Response(entriesCsv(), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="nutrition-entries-${todayLocal()}.csv"`
		}
	});
