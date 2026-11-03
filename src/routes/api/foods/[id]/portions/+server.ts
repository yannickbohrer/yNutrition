import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addPortion } from '#lib/server/customFoods.ts';
import { getFoodDTO, getFoodRow } from '#lib/server/foods/repo.ts';
import { handle, intParam, lang, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const id = intParam(event.params.id);
	if (!getFoodRow(id)) error(404, 'not found');
	const body = await readJson<{ label: string; amount: number }>(event);
	handle(() => addPortion(id, String(body.label ?? ''), Number(body.amount)));
	return json(getFoodDTO(id, lang()), { status: 201 });
};
