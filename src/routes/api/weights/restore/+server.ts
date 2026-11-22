import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreWeight } from '#lib/server/weights.ts';
import { handle, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const b = await readJson<{ row?: Parameters<typeof restoreWeight>[0] }>(event);
	if (!b.row || typeof b.row.id !== 'number') error(400, 'row required');
	return json(handle(() => restoreWeight(b.row!)));
};
