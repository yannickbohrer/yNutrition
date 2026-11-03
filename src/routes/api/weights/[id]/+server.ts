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

export const DELETE: RequestHandler = async ({ params }) => {
	deleteWeight(intParam(params.id));
	return json({ ok: true });
};
