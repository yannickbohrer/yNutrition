import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserSettings, updateUserSettings } from '#lib/server/settings.ts';
import { readJson } from '#lib/server/http.ts';
import type { UserSettings } from '#lib/types.ts';

export const GET: RequestHandler = async () => json(getUserSettings());

export const PATCH: RequestHandler = async (event) => {
	const b = await readJson<Partial<UserSettings>>(event);
	return json(updateUserSettings(b));
};
