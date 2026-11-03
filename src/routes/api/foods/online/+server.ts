import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchOnline } from '#lib/server/foods/service.ts';
import { lang } from '#lib/server/http.ts';

/** Online search (Open Food Facts / USDA). Only called on explicit user action — never per keystroke. */
export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	return json(await searchOnline(q, lang()));
};
