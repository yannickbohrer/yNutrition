/**
 * Runtime configuration read from process.env. Kept independent of `$app/env` so that the
 * same modules work in SvelteKit, Vitest and the CLI scripts.
 */
import fs from 'node:fs';

let loaded = false;
function loadDotEnv() {
	if (loaded) return;
	loaded = true;
	if (process.env.NODE_ENV === 'production' || process.env.VITEST) return;
	try {
		if (fs.existsSync('.env')) process.loadEnvFile('.env');
	} catch {
		/* ignore malformed .env in dev */
	}
}

function str(name: string, fallback = ''): string {
	loadDotEnv();
	const v = process.env[name];
	return v === undefined || v === '' ? fallback : v;
}

export const config = {
	get databasePath() {
		return str('DATABASE_PATH', str('DATABASE_URL', 'data/nutrition.db'));
	},
	get origin() {
		return str('ORIGIN', 'http://localhost:5173');
	},
	get rpId() {
		return str('RP_ID', new URL(this.origin).hostname);
	},
	get rpName() {
		return str('RP_NAME', 'Nutrition');
	},
	get setupToken() {
		return str('SETUP_TOKEN');
	},
	get sessionSecret() {
		return str('SESSION_SECRET', 'dev-insecure-session-secret');
	},
	get offContactEmail() {
		return str('OFF_CONTACT_EMAIL');
	},
	get offBaseUrl() {
		return str('OFF_BASE_URL', 'https://world.openfoodfacts.org');
	},
	get offSearchUrl() {
		return str('OFF_SEARCH_URL', 'https://search.openfoodfacts.org');
	},
	get offEnabled() {
		return str('OFF_ENABLED', 'true') !== 'false';
	},
	get usdaApiKey() {
		return str('USDA_API_KEY');
	},
	get usdaBaseUrl() {
		return str('USDA_BASE_URL', 'https://api.nal.usda.gov/fdc/v1');
	},
	get timezone() {
		return str('APP_TZ', str('TZ', 'Europe/Zurich'));
	},
	get userAgent() {
		const email = this.offContactEmail;
		return `Nutrition/1.0${email ? ` (${email})` : ''}`;
	}
};
