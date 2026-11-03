import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFood, getRecipe, saveRecipe, type RecipeInput } from '#lib/server/customFoods.ts';
import { handle, intParam, lang, readJson } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ params }) => {
	const r = getRecipe(intParam(params.id), lang());
	if (!r) error(404, 'not found');
	return json(r);
};

export const PUT: RequestHandler = async (event) => {
	const id = intParam(event.params.id);
	const body = await readJson<RecipeInput>(event);
	handle(() => saveRecipe(body, id));
	return json(getRecipe(id, lang()));
};

export const DELETE: RequestHandler = async ({ params }) => {
	handle(() => deleteFood(intParam(params.id)));
	return json({ ok: true });
};
