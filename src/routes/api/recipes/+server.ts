import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	listByFoodSource,
	saveRecipe,
	getRecipe,
	type RecipeInput
} from '#lib/server/customFoods.ts';
import { favoriteIds, toSummary } from '#lib/server/foods/repo.ts';
import { handle, lang, readJson } from '#lib/server/http.ts';

export const GET: RequestHandler = async () => {
	const l = lang();
	const favs = favoriteIds();
	return json(listByFoodSource('recipe').map((r) => toSummary(r, l, favs)));
};

export const POST: RequestHandler = async (event) => {
	const body = await readJson<RecipeInput>(event);
	const id = handle(() => saveRecipe(body, null));
	return json(getRecipe(id, lang()), { status: 201 });
};
