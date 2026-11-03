import type { UserSettings } from './types';

export const DEFAULT_CLIENT_SETTINGS: UserSettings = {
	lang: 'de',
	energyUnit: 'kcal',
	showKj: false,
	targets: { energy_kcal: 2000, protein: 100, carbs: 230, fat: 70, extra: {} }
};
