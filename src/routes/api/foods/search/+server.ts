import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchLocal } from '#lib/server/foods/service.ts';
import { lang } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	return json(searchLocal(q, lang()));
};
