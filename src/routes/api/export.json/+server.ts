import type { RequestHandler } from './$types';
import { exportBackup } from '#lib/server/backup.ts';
import { todayLocal } from '#lib/dates.ts';

export const GET: RequestHandler = async () =>
	new Response(JSON.stringify(exportBackup(), null, 1), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="nutrition-backup-${todayLocal()}.json"`
		}
	});
