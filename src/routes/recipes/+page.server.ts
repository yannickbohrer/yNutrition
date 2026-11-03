import type { PageServerLoad } from './$types';
import { listByFoodSource } from '#lib/server/customFoods.ts';
import { favoriteIds, toSummary } from '#lib/server/foods/repo.ts';
import { getUserSettings } from '#lib/server/settings.ts';

export const load: PageServerLoad = async () => {
	const lang = getUserSettings().lang;
	const favs = favoriteIds();
	return {
		recipes: listByFoodSource('recipe').map((r) => ({
			...toSummary(r, lang, favs),
			servingWeight: r.servingQuantity
		})),
		custom: listByFoodSource('custom').map((r) => toSummary(r, lang, favs))
	};
};
