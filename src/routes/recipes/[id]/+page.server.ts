import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRecipe } from '#lib/server/customFoods.ts';
import { getUserSettings } from '#lib/server/settings.ts';

export const load: PageServerLoad = async ({ params }) => {
	if (params.id === 'new') return { recipe: null };
	const r = getRecipe(Number(params.id), getUserSettings().lang);
	if (!r) error(404, 'not found');
	return { recipe: r };
};
