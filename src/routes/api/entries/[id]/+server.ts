import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteEntry, updateEntry } from '#lib/server/log.ts';
import { handle, intParam, readJson } from '#lib/server/http.ts';

export const PATCH: RequestHandler = async (event) => {
	const id = intParam(event.params.id);
	const b = await readJson<{ amount?: number; date?: string; time?: string }>(event);
	const e = handle(() => updateEntry(id, b));
	if (!e) error(404, 'not found');
	return json(e);
};

/** Returns the deleted row so the client can offer "undo" via /api/entries/restore. */
export const DELETE: RequestHandler = async ({ params }) => {
	const row = deleteEntry(intParam(params.id));
	if (!row) error(404, 'not found');
	return json({ ok: true, row });
};
