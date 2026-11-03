/** App-wide settings mirrored on the client (set from the root layout data). */
import type { UserSettings } from '../types';
import { DEFAULT_CLIENT_SETTINGS } from '../defaults';

export const app = $state<{
	settings: UserSettings;
	today: string;
	usdaEnabled: boolean;
	swissVersion: string;
}>({
	settings: DEFAULT_CLIENT_SETTINGS,
	today: '',
	usdaEnabled: false,
	swissVersion: ''
});
