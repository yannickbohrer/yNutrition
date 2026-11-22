import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteWeight, updateWeight } from '#lib/server/weights.ts';
import { handle, intParam, readJson } from '#lib/server/http.ts';

export const PATCH: RequestHandler = async (event) => {
	const b = await readJson<{ date?: string; kg?: number; note?: string | null }>(event);
	const w = handle(() => updateWeight(intParam(event.params.id), b));
	if (!w) error(404, 'not found');
	return json(w);
};

/** Returns the deleted row so the client can offer "undo" via /api/weights/restore. */
export const DELETE: RequestHandler = async ({ params }) => {
	const row = deleteWeight(intParam(params.id));
	if (!row) error(404, 'not found');
	return json({ ok: true, row });
};
