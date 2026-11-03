import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';

export const GET: RequestHandler = async () => {
	try {
		getDb().$client.prepare('select 1').get();
		return json({ ok: true });
	} catch {
		return json({ ok: false }, { status: 503 });
	}
};
