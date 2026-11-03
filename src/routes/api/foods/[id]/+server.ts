import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, updateCustomFood, type CustomFoodInput } from '#lib/server/customFoods.ts';
import { getFoodDTO } from '#lib/server/foods/repo.ts';
import { handle, intParam, lang, readJson } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ params }) => {
	const f = getFoodDTO(intParam(params.id), lang());
	if (!f) error(404, 'not found');
	return json(f);
};

export const PUT: RequestHandler = async (event) => {
	const id = intParam(event.params.id);
	const body = await readJson<CustomFoodInput>(event);
	handle(() => updateCustomFood(id, body));
	return json(getFoodDTO(id, lang()));
};

export const DELETE: RequestHandler = async ({ params }) => {
	handle(() => deleteFood(intParam(params.id)));
	return json({ ok: true });
};
