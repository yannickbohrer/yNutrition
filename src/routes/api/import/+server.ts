import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importBackup } from '#lib/server/backup.ts';
import { handle, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const body = await readJson(event, 50_000_000);
	return json({ ok: true, ...handle(() => importBackup(body)) });
};
