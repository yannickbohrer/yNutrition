import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { suggestions } from '#lib/server/foods/service.ts';
import { lang } from '#lib/server/http.ts';

export const GET: RequestHandler = async () => json(suggestions(lang()));
