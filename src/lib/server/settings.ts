import { asc, eq, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { settings, targetHistory } from './db/schema';
import { todayLocal } from '../dates';
import { sanitizeNutrients, isNutrientKey } from '../nutrients';
import { gramsFromSplit, sanitizeSplit } from '../macros';
import type { Lang, NutrientTarget, Targets, UserSettings } from '../types';

export const DEFAULT_SETTINGS: UserSettings = {
	lang: 'de',
	energyUnit: 'kcal',
	showKj: false,
	targets: { energy_kcal: 2000, protein: 100, carbs: 230, fat: 70, fiber: 30, extra: {} },
	macroSplit: null
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
	const extra = { ...(s.targets?.extra ?? {}) };
	// fibre used to be an optional extra target: carry its goal over to the main target
	let fiber = s.targets?.fiber;
	if (fiber === undefined && extra.fiber) {
		fiber = extra.fiber.min ?? undefined;
		delete extra.fiber;
	}
	return {
		...DEFAULT_SETTINGS,
		...s,
		targets: {
			...DEFAULT_SETTINGS.targets,
			...(s.targets ?? {}),
			fiber: fiber ?? DEFAULT_SETTINGS.targets.fiber,
			extra
		},
		macroSplit: sanitizeSplit(s.macroSplit)
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
		if (!isNutrientKey(k) || k === 'fiber' || !v || typeof v !== 'object') continue;
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
		fiber: posNum(i.fiber, fallback.fiber),
		extra
	};
}

export function updateUserSettings(
	patch: Partial<UserSettings>,
	db: DB = getDb(),
	opts: { recordHistory?: boolean } = {}
): UserSettings {
	const cur = getUserSettings(db);
	// `null` switches back to grams; an invalid split keeps the current mode
	const macroSplit =
		patch.macroSplit === undefined
			? cur.macroSplit
			: patch.macroSplit === null
				? null
				: (sanitizeSplit(patch.macroSplit) ?? cur.macroSplit);
	let targets = patch.targets ? sanitizeTargets(patch.targets, cur.targets) : cur.targets;
	if (macroSplit) targets = { ...targets, ...gramsFromSplit(targets.energy_kcal, macroSplit) };
	const next: UserSettings = {
		lang: patch.lang === 'en' || patch.lang === 'de' ? (patch.lang as Lang) : cur.lang,
		energyUnit:
			patch.energyUnit === 'kJ' || patch.energyUnit === 'kcal' ? patch.energyUnit : cur.energyUnit,
		showKj: typeof patch.showKj === 'boolean' ? patch.showKj : cur.showKj,
		targets,
		macroSplit
	};
	db.transaction((tx) => {
		setSetting('user', next, tx as unknown as DB);
		if (opts.recordHistory !== false && !sameTargets(cur.targets, next.targets))
			recordTargetChange(cur.targets, next.targets, today(), tx as unknown as DB);
	});
	return next;
}

// ---------- target history ----------

/** Effective date of the targets that applied before the first recorded change. */
export const BASELINE_DATE = '0000-01-01';

let today = () => todayLocal();
/** For tests: fix the date that target changes take effect. */
export function setTargetClock(fn: (() => string) | null) {
	today = fn ?? (() => todayLocal());
}

const sameTargets = (a: Targets, b: Targets) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One row per day a change takes effect (a second change on the same day replaces the first).
 * The first change also stores the targets that applied until then, from `BASELINE_DATE`.
 */
function recordTargetChange(prev: Targets, next: Targets, date: string, db: DB) {
	const hasAny = db.select({ d: targetHistory.effectiveFrom }).from(targetHistory).limit(1).get();
	if (!hasAny && date > BASELINE_DATE)
		db.insert(targetHistory).values({ effectiveFrom: BASELINE_DATE, targets: prev }).run();
	db.insert(targetHistory)
		.values({ effectiveFrom: date, targets: next, createdAt: Date.now() })
		.onConflictDoUpdate({
			target: targetHistory.effectiveFrom,
			set: { targets: next, createdAt: Date.now() }
		})
		.run();
}

export interface TargetPeriod {
	from: string;
	targets: Targets;
}

/**
 * The targets in effect from `from` to `to`, oldest first: the change in effect on `from` plus
 * every change inside the range. One indexed query (the date is the primary key). Empty when no
 * change was ever recorded: then the current targets have always applied.
 */
export function targetPeriods(from: string, to: string, db: DB = getDb()): TargetPeriod[] {
	return db
		.select({ from: targetHistory.effectiveFrom, targets: targetHistory.targets })
		.from(targetHistory)
		.where(
			sql`${targetHistory.effectiveFrom} <= ${to} AND ${targetHistory.effectiveFrom} >= coalesce((SELECT max(effective_from) FROM target_history WHERE effective_from <= ${from}), '')`
		)
		.orderBy(asc(targetHistory.effectiveFrom))
		.all()
		.map((r) => ({ from: r.from, targets: sanitizeTargets(r.targets) }));
}

/** Number of recorded target changes (the baseline row doesn't count). */
export function targetChangeCount(db: DB = getDb()): number {
	return db
		.select({ n: sql<number>`count(*)` })
		.from(targetHistory)
		.where(sql`${targetHistory.effectiveFrom} > ${BASELINE_DATE}`)
		.get()!.n;
}

export function listTargetHistory(db: DB = getDb()) {
	return db.select().from(targetHistory).orderBy(asc(targetHistory.effectiveFrom)).all();
}
