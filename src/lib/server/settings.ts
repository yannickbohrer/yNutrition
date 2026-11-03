import { eq } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { settings } from './db/schema';
import { sanitizeNutrients, isNutrientKey } from '../nutrients';
import type { Lang, NutrientTarget, Targets, UserSettings } from '../types';

export const DEFAULT_SETTINGS: UserSettings = {
	lang: 'de',
	energyUnit: 'kcal',
	showKj: false,
	targets: { energy_kcal: 2000, protein: 100, carbs: 230, fat: 70, extra: {} }
};

export function getSetting<T>(key: string, db: DB = getDb()): T | undefined {
	const row = db.select().from(settings).where(eq(settings.key, key)).get();
	return row ? (row.value as T) : undefined;
}

export function setSetting(key: string, value: unknown, db: DB = getDb()) {
	db.insert(settings)
		.values({ key, value })
		.onConflictDoUpdate({ target: settings.key, set: { value } })
		.run();
}

export function getUserSettings(db: DB = getDb()): UserSettings {
	const s = getSetting<Partial<UserSettings>>('user', db) ?? {};
	return {
		...DEFAULT_SETTINGS,
		...s,
		targets: {
			...DEFAULT_SETTINGS.targets,
			...(s.targets ?? {}),
			extra: { ...(s.targets?.extra ?? {}) }
		}
	};
}

const posNum = (v: unknown, fallback: number) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 && n < 100000 ? n : fallback;
};

export function sanitizeTargets(
	input: unknown,
	fallback: Targets = DEFAULT_SETTINGS.targets
): Targets {
	const i = (input ?? {}) as Partial<Targets>;
	const extra: Partial<Record<string, NutrientTarget>> = {};
	for (const [k, v] of Object.entries(i.extra ?? {})) {
		if (!isNutrientKey(k) || !v || typeof v !== 'object') continue;
		const min = sanitizeNutrients({ [k]: (v as NutrientTarget).min })[k];
		const max = sanitizeNutrients({ [k]: (v as NutrientTarget).max })[k];
		if (min === undefined && max === undefined) continue;
		extra[k] = { min: min ?? null, max: max ?? null };
	}
	return {
		energy_kcal: posNum(i.energy_kcal, fallback.energy_kcal),
		protein: posNum(i.protein, fallback.protein),
		carbs: posNum(i.carbs, fallback.carbs),
		fat: posNum(i.fat, fallback.fat),
		extra
	};
}

export function updateUserSettings(patch: Partial<UserSettings>, db: DB = getDb()): UserSettings {
	const cur = getUserSettings(db);
	const next: UserSettings = {
		lang: patch.lang === 'en' || patch.lang === 'de' ? (patch.lang as Lang) : cur.lang,
		energyUnit:
			patch.energyUnit === 'kJ' || patch.energyUnit === 'kcal' ? patch.energyUnit : cur.energyUnit,
		showKj: typeof patch.showKj === 'boolean' ? patch.showKj : cur.showKj,
		targets: patch.targets ? sanitizeTargets(patch.targets, cur.targets) : cur.targets
	};
	setSetting('user', next, db);
	return next;
}
