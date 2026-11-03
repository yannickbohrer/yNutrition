import type { RequestHandler } from './$types';
import { weightsCsv } from '#lib/server/backup.ts';
import { todayLocal } from '#lib/dates.ts';

export const GET: RequestHandler = async () =>
	new Response(weightsCsv(), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="nutrition-weights-${todayLocal()}.csv"`
		}
	});
