import type { LayoutServerLoad } from './$types';
import { getUserSettings, getSetting } from '#lib/server/settings.ts';
import { todayLocal } from '#lib/dates.ts';
import { config } from '#lib/server/config.ts';

export const load: LayoutServerLoad = async ({ locals }) => {
	const settings = getUserSettings();
	return {
		authed: !!locals.session,
		settings,
		today: todayLocal(config.timezone),
		usdaEnabled: Boolean(config.usdaApiKey),
		swissVersion: String(getSetting<string>('swissfcd_version') ?? '').split('+')[0]
	};
};
