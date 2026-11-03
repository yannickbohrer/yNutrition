import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFoodRow, setFavorite } from '#lib/server/foods/repo.ts';
import { intParam, readJson } from '#lib/server/http.ts';

export const PUT: RequestHandler = async (event) => {
	const id = intParam(event.params.id);
	if (!getFoodRow(id)) error(404, 'not found');
	const body = await readJson<{ on?: boolean }>(event);
	setFavorite(id, body.on !== false);
	return json({ ok: true, favorite: body.on !== false });
};
