import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCustomFood, type CustomFoodInput } from '#lib/server/customFoods.ts';
import { getFoodDTO } from '#lib/server/foods/repo.ts';
import { handle, lang, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const body = await readJson<CustomFoodInput>(event);
	const id = handle(() => createCustomFood(body));
	return json(getFoodDTO(id, lang()), { status: 201 });
};
