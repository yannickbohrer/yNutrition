/**
 * Portion presets: user-defined → recipe servings → OFF serving size → curated seed file
 * (data/portion-presets.json) → generic defaults.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Basis, FoodSourceId, Lang, Portion } from '../../types';

interface SeedPortion {
	de: string;
	en: string;
	g?: number;
	ml?: number;
	default?: boolean;
}
interface SeedRule {
	id: string;
	match: string[];
	portions: SeedPortion[];
}
interface CompiledRule extends SeedRule {
	re: RegExp[];
}

let rules: CompiledRule[] | undefined;

function presetsFile(): string {
	const candidates = [
		process.env.PORTION_PRESETS_PATH,
		path.resolve('data/portion-presets.json'),
		path.resolve(import.meta.dirname ?? '.', '../../../../data/portion-presets.json')
	].filter(Boolean) as string[];
	const f = candidates.find((c) => fs.existsSync(c));
	if (!f) throw new Error('portion-presets.json not found');
	return f;
}

export function loadRules(): CompiledRule[] {
	if (!rules) {
		const json = JSON.parse(fs.readFileSync(presetsFile(), 'utf8')) as { presets: SeedRule[] };
		rules = json.presets.map((r) => ({ ...r, re: r.match.map((m) => new RegExp(m, 'i')) }));
	}
	return rules;
}

/** Find the seed rule for a food. German name is tried against all rules first, then English. */
export function matchSeedRule(nameDe: string | null, nameEn: string | null): SeedRule | null {
	const all = loadRules();
	for (const name of [nameDe, nameEn]) {
		if (!name) continue;
		const r = all.find((rule) => rule.re.some((re) => re.test(name)));
		if (r) return r;
	}
	return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface PortionInput {
	source: FoodSourceId;
	nameDe: string | null;
	nameEn: string | null;
	basis: Basis;
	density: number | null;
	servingSize: string | null;
	servingQuantity: number | null;
	userPortions: { id: number; labelDe: string; labelEn: string | null; amount: number }[];
	recipeServingWeight?: number | null;
}

export function buildPortions(food: PortionInput, lang: Lang): Portion[] {
	const out: Portion[] = [];
	const t = (de: string, en: string) => (lang === 'en' ? en : de);

	for (const p of food.userPortions) {
		out.push({
			id: p.id,
			kind: 'user',
			label: (lang === 'en' ? p.labelEn : null) ?? p.labelDe,
			amount: p.amount
		});
	}

	if (food.source === 'recipe' && food.recipeServingWeight && food.recipeServingWeight > 0) {
		out.push({
			kind: 'recipe',
			label: t('1 Portion', '1 serving'),
			amount: round1(food.recipeServingWeight),
			default: true
		});
		out.push({
			kind: 'recipe',
			label: t('½ Portion', '½ serving'),
			amount: round1(food.recipeServingWeight / 2)
		});
	}

	const hasServing = food.servingQuantity && food.servingQuantity > 0;
	if (hasServing) {
		const label = food.servingSize
			? `${t('1 Portion', '1 serving')} (${food.servingSize})`
			: t('1 Portion', '1 serving');
		out.push({ kind: 'serving', label, amount: round1(food.servingQuantity!), default: true });
	}

	const useSeed = food.source !== 'recipe' && (food.source !== 'off' || !hasServing);
	const rule = useSeed ? matchSeedRule(food.nameDe, food.nameEn) : null;
	if (rule) {
		for (const p of rule.portions) {
			let amount: number;
			if (p.ml !== undefined) amount = food.basis === 'ml' ? p.ml : p.ml * (food.density ?? 1);
			else amount = p.g ?? 100;
			out.push({ kind: 'seed', label: t(p.de, p.en), amount: round1(amount), default: p.default });
		}
	}

	if (!out.some((p) => p.kind !== 'user')) {
		out.push({ kind: 'default', label: t('1 Portion', '1 serving'), amount: 150, default: true });
	}
	if (!out.some((p) => p.amount === 100)) {
		out.push({ kind: 'default', label: `100 ${food.basis}`, amount: 100 });
	}

	// dedupe identical amounts (keep first = higher priority), sort ascending
	const seen = new Set<number>();
	const deduped = out.filter((p) => {
		if (seen.has(p.amount)) return false;
		seen.add(p.amount);
		return true;
	});
	// only one default: highest priority one
	let hadDefault = false;
	for (const p of deduped) {
		if (p.default && !hadDefault) hadDefault = true;
		else delete p.default;
	}
	return deduped.sort((a, b) => a.amount - b.amount);
}

export function defaultAmount(portions: Portion[], lastAmount: number | null): number {
	if (lastAmount && lastAmount > 0) return lastAmount;
	const d =
		portions.find((p) => p.default) ?? portions.find((p) => p.kind === 'user') ?? portions[0];
	return d?.amount ?? 100;
}
