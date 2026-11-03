import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { copyEntries } from '#lib/server/log.ts';
import { handle, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const b = await readJson<{ ids?: number[]; date?: string; time?: string | null }>(event);
	const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : [];
	return json(
		handle(() => copyEntries(ids, String(b.date ?? ''), b.time ?? null)),
		{ status: 201 }
	);
};
