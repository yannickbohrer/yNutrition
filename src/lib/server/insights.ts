import { getDb, type DB } from './db';
import { aggregate, macroEnergyShares, rankContributions, movingAverage } from '../nutrition';
import type { NutrientKey, Nutrients } from '../nutrients';
import { dateRange } from '../dates';
import { entriesBetween } from './log';
import { weightsBetween } from './weights';
import { getUserSettings } from './settings';

export interface InsightDay {
	date: string;
	kcal: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	entries: number;
	weight: number | null;
}

export interface InsightsDTO {
	from: string;
	to: string;
	days: InsightDay[];
	targets: { kcal: number; protein: number; carbs: number; fat: number };
	/** averages over logged days only */
	avg: { kcal: number; protein: number; carbs: number; fat: number };
	energyShares: { protein: number; carbs: number; fat: number };
	loggedDays: number;
	/** days within ±10 % of the kcal target, among logged days */
	onTargetDays: number;
	overDays: number;
	underDays: number;
	weightTrend: { date: string; value: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function insights(from: string, to: string, db: DB = getDb()): InsightsDTO {
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
	const days: InsightDay[] = dateRange(from, to).map((date) => {
		const list = byDay.get(date) ?? [];
		const agg = aggregate(list.map((n) => ({ nutrients: n })));
		const v = (k: NutrientKey) => (list.length ? r1(agg.totals[k] ?? 0) : null);
		return {
			date,
			kcal: v('energy_kcal'),
			protein: v('protein'),
			carbs: v('carbs'),
			fat: v('fat'),
			entries: list.length,
			weight: wByDay.get(date) ?? null
		};
	});
	const logged = days.filter((d) => d.entries > 0);
	const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') =>
		logged.length ? r1(logged.reduce((sum, d) => sum + (d[k] ?? 0), 0) / logged.length) : 0;
	const a = { kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') };
	let on = 0,
		over = 0,
		under = 0;
	for (const d of logged) {
		const k = d.kcal ?? 0;
		if (k > t.energy_kcal * 1.1) over++;
		else if (k < t.energy_kcal * 0.9) under++;
		else on++;
	}
	return {
		from,
		to,
		days,
		targets: { kcal: t.energy_kcal, protein: t.protein, carbs: t.carbs, fat: t.fat },
		avg: a,
		energyShares: macroEnergyShares({ protein: a.protein, carbs: a.carbs, fat: a.fat }),
		loggedDays: logged.length,
		onTargetDays: on,
		overDays: over,
		underDays: under,
		weightTrend: movingAverage(
			ws.map((w) => ({ date: w.date, value: w.kg })),
			7
		)
	};
}

export function breakdown(from: string, to: string, nutrient: NutrientKey, db: DB = getDb()) {
	const entries = entriesBetween(from, to, db);
	const missing = entries.filter((e) => e.nutrients[nutrient] === undefined).length;
	const ranked = rankContributions(
		entries.map((e) => ({
			key: e.foodId !== null ? `f${e.foodId}` : `n${e.name}`,
			label: e.name,
			nutrients: e.nutrients
		})),
		nutrient
	);
	return { from, to, nutrient, ...ranked, entries: entries.length, missing };
}
