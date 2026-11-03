import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getFoodDTO } from '#lib/server/foods/repo.ts';
import { getUserSettings } from '#lib/server/settings.ts';

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	const food = Number.isInteger(id) ? getFoodDTO(id, getUserSettings().lang) : null;
	if (!food) error(404, 'not found');
	return { food };
};
