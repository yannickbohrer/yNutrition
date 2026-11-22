import { lt, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { logEntries } from './db/schema';
import { aggregate, macroEnergyShares, rankContributions, movingAverage } from '../nutrition';
import type { NutrientKey, Nutrients } from '../nutrients';
import { dateRange, diffDays } from '../dates';
import { entriesBetween } from './log';
import { weightsBetween } from './weights';
import { getUserSettings, targetChangeCount, targetPeriods } from './settings';
import type { Targets } from '../types';

export interface InsightDay {
	/** the day, or the first day of the month / year when bucketed */
	date: string;
	/** total of the day; for a month the average per logged day */
	kcal: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	entries: number;
	/** logged days in the bucket (0 or 1 for a day) */
	loggedDays: number;
	/** weigh-in of the day (last one wins); for a month the average */
	weight: number | null;
	/** kcal target that applied then (for a month: the average over its days) */
	targetThen: number;
}

export type Bucket = 'day' | 'month' | 'year';
/** the whole history fits in one request; ~100 years of days */
const MAX_DAYS = 36_600;

type Macro = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
type MacroSet = Record<Macro, number>;

export interface Adherence {
	onTargetDays: number;
	overDays: number;
	underDays: number;
}

export interface InsightsDTO {
	from: string;
	to: string;
	bucket: Bucket;
	days: InsightDay[];
	/** current targets (the default comparison) */
	targets: MacroSet;
	/** averages over logged days only */
	avg: MacroSet;
	energyShares: { protein: number; carbs: number; fat: number };
	loggedDays: number;
	/** days within ±10 % of the kcal target, among logged days — against the current targets */
	onTargetDays: number;
	overDays: number;
	underDays: number;
	/** the same comparison against the targets that applied on each day */
	historical: Adherence & {
		/** per-day targets averaged over the logged days (over all days if none was logged) */
		targets: MacroSet;
	};
	/** true when targets were changed at least once, so both comparisons can differ */
	hasTargetHistory: boolean;
	/** first day with a log entry, or null without any (limits paging back) */
	firstDate: string | null;
	/** latest day with a log entry before `from` (to jump back from an empty period) */
	lastBefore: string | null;
	weightTrend: { date: string; value: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const toSet = (t: Targets): MacroSet => ({
	kcal: t.energy_kcal,
	protein: t.protein,
	carbs: t.carbs,
	fat: t.fat,
	fiber: t.fiber
});
const MACROS: Macro[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

function adherence(days: { kcal: number | null; target: number }[]): Adherence {
	let on = 0,
		over = 0,
		under = 0;
	for (const d of days) {
		const k = d.kcal ?? 0;
		if (k > d.target * 1.1) over++;
		else if (k < d.target * 0.9) under++;
		else on++;
	}
	return { onTargetDays: on, overDays: over, underDays: under };
}

/** Targets per day of `dates` (sorted), from the change history; current targets without one. */
function targetsByDay(dates: string[], current: Targets, db: DB): Targets[] {
	if (!dates.length) return [];
	const periods = targetPeriods(dates[0], dates[dates.length - 1], db);
	if (!periods.length) return dates.map(() => current);
	let i = 0;
	return dates.map((d) => {
		while (i + 1 < periods.length && periods[i + 1].from <= d) i++;
		// a day before the first recorded period can't happen (the baseline starts at year 0)
		return periods[i].from <= d ? periods[i].targets : current;
	});
}

export function firstLogDate(db: DB = getDb()): string | null {
	return (
		db
			.select({ d: sql<string | null>`min(${logEntries.date})` })
			.from(logEntries)
			.get()?.d ?? null
	);
}

export function insights(
	from: string,
	to: string,
	bucket: Bucket = 'day',
	db: DB = getDb()
): InsightsDTO {
	const s = getUserSettings(db);
	const t = s.targets;
	const entries = entriesBetween(from, to, db);
	const byDay = new Map<string, Nutrients[]>();
	for (const e of entries) {
		const list = byDay.get(e.date) ?? [];
		list.push(e.nutrients);
		byDay.set(e.date, list);
	}
	const ws = weightsBetween(from, to, db);
	const wByDay = new Map<string, number>();
	for (const w of ws) wByDay.set(w.date, w.kg); // last one wins
	const dates = dateRange(from, to, MAX_DAYS);
	const then = targetsByDay(dates, t, db);
	const daily: InsightDay[] = dates.map((date, i) => {
		const list = byDay.get(date) ?? [];
		const agg = aggregate(list.map((n) => ({ nutrients: n })));
		const v = (k: NutrientKey) => (list.length ? r1(agg.totals[k] ?? 0) : null);
		return {
			date,
			kcal: v('energy_kcal'),
			protein: v('protein'),
			carbs: v('carbs'),
			fat: v('fat'),
			fiber: v('fiber'),
			entries: list.length,
			loggedDays: list.length ? 1 : 0,
			weight: wByDay.get(date) ?? null,
			targetThen: then[i].energy_kcal
		};
	});
	const loggedIdx = daily.flatMap((d, i) => (d.entries > 0 ? [i] : []));
	const logged = loggedIdx.map((i) => daily[i]);
	const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
	const avg = Object.fromEntries(
		MACROS.map((k) => [k, mean(logged.map((d) => d[k] ?? 0))])
	) as MacroSet;
	const thenIdx = loggedIdx.length ? loggedIdx : daily.map((_, i) => i);
	const thenTargets = Object.fromEntries(
		MACROS.map((k) => [k, mean(thenIdx.map((i) => toSet(then[i])[k]))])
	) as MacroSet;

	return {
		from,
		to,
		bucket,
		days: bucket === 'day' ? daily : byBucket(daily, bucket),
		targets: toSet(t),
		avg,
		energyShares: macroEnergyShares({ protein: avg.protein, carbs: avg.carbs, fat: avg.fat }),
		loggedDays: logged.length,
		...adherence(logged.map((d) => ({ kcal: d.kcal, target: t.energy_kcal }))),
		historical: {
			...adherence(logged.map((d) => ({ kcal: d.kcal, target: d.targetThen }))),
			targets: thenTargets
		},
		hasTargetHistory: targetChangeCount(db) > 0,
		firstDate: firstLogDate(db),
		lastBefore:
			db
				.select({ d: sql<string | null>`max(${logEntries.date})` })
				.from(logEntries)
				.where(lt(logEntries.date, from))
				.get()?.d ?? null,
		weightTrend: movingAverage(
			ws.map((w) => ({ date: w.date, value: w.kg })),
			7
		)
	};
}

/** Whole history: from the first entry (or today) to today; months up to two years, then years. */
export function allTimeRange(today: string, db: DB = getDb()) {
	const first = firstLogDate(db);
	const from = first && first < today ? first : today;
	const bucket: Bucket = diffDays(from, today) > 731 ? 'year' : 'month';
	return { from, to: today, bucket };
}

/** Month or year buckets: averages per logged day (weights: per weighed day, targets: per day). */
function byBucket(days: InsightDay[], bucket: 'month' | 'year'): InsightDay[] {
	const groups = new Map<string, InsightDay[]>();
	for (const d of days) {
		const k = bucket === 'month' ? d.date.slice(0, 8) + '01' : d.date.slice(0, 5) + '01-01';
		const g = groups.get(k) ?? [];
		g.push(d);
		groups.set(k, g);
	}
	return [...groups].map(([date, g]) => {
		const logged = g.filter((d) => d.entries > 0);
		const avgOf = (k: Macro) =>
			logged.length ? r1(logged.reduce((a, d) => a + (d[k] ?? 0), 0) / logged.length) : null;
		const weighed = g.filter((d) => d.weight !== null);
		const basis = logged.length ? logged : g;
		return {
			date,
			kcal: avgOf('kcal'),
			protein: avgOf('protein'),
			carbs: avgOf('carbs'),
			fat: avgOf('fat'),
			fiber: avgOf('fiber'),
			entries: g.reduce((a, d) => a + d.entries, 0),
			loggedDays: logged.length,
			weight: weighed.length
				? Math.round((weighed.reduce((a, d) => a + d.weight!, 0) / weighed.length) * 100) / 100
				: null,
			targetThen: Math.round(basis.reduce((a, d) => a + d.targetThen, 0) / basis.length)
		};
	});
}

export function breakdown(from: string, to: string, nutrient: NutrientKey, db: DB = getDb()) {
	const entries = entriesBetween(from, to, db);
	const missing = entries.filter((e) => e.nutrients[nutrient] === undefined).length;
	const ranked = rankContributions(
		entries.map((e) => ({
			key: e.foodId !== null ? `f${e.foodId}` : `n${e.name}`,
			label: e.name,
			nutrients: e.nutrients,
			amount: e.amount,
			basis: e.basis,
			date: e.date
		})),
		nutrient
	);
	return { from, to, nutrient, ...ranked, entries: entries.length, missing };
}
