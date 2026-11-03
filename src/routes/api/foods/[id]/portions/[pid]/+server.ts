import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deletePortion } from '#lib/server/customFoods.ts';
import { getFoodDTO } from '#lib/server/foods/repo.ts';
import { intParam, lang } from '#lib/server/http.ts';

export const DELETE: RequestHandler = async ({ params }) => {
	const id = intParam(params.id);
	deletePortion(id, intParam(params.pid));
	return json(getFoodDTO(id, lang()));
};
