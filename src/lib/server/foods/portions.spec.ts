import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
	buildPortions,
	defaultAmount,
	loadRules,
	matchSeedRule,
	type PortionInput
} from './portions';

const base: PortionInput = {
	source: 'swissfcd',
	nameDe: null,
	nameEn: null,
	basis: 'g',
	density: null,
	servingSize: null,
	servingQuantity: null,
	userPortions: []
};

describe('portion presets seed file', () => {
	it('has at least 200 rules, unique ids, valid regexes and realistic weights', () => {
		const rules = loadRules();
		expect(rules.length).toBeGreaterThanOrEqual(200);
		expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
		for (const r of rules) {
			expect(r.portions.length).toBeGreaterThan(0);
			for (const p of r.portions) {
				const amt = p.g ?? p.ml;
				expect(amt, r.id).toBeGreaterThan(0);
				expect(amt, r.id).toBeLessThanOrEqual(1000);
				expect(p.de, r.id).not.toMatch(/ß/);
			}
			expect(r.portions.filter((p) => p.default).length, r.id).toBeLessThanOrEqual(1);
		}
	});

	const cases: [string, string][] = [
		['Banane, roh', 'banana'],
		['Apfel, roh', 'apple'],
		['Weissbrot', 'bread'],
		['Ruchbrot', 'bread'],
		['Toastbrot, Vollkorn', 'toast'],
		['Hühnerei, ganz, roh', 'egg'],
		['Hühnereigelb, roh (Eidotter)', 'egg-yolk'],
		['Vollmilch, UHT', 'milk'],
		['Vollmilchpulver', 'milk-powder'],
		['Milchschokolade', 'chocolate-bar'],
		['Teigwaren ohne Ei, gekocht im Salzwasser (unjodiert)', 'pasta-cooked'],
		['Teigwaren ohne Ei, trocken', 'pasta-dry'],
		['Reis poliert, trocken', 'rice-dry'],
		['Butter, gesalzen', 'butter'],
		['Olivenöl', 'oil'],
		['Thon im Öl, abgetropft', 'tuna-can'],
		['Emmentaler, vollfett', 'cheese'],
		['Fleischkäse', 'cold-cuts'],
		['Kalbsbratwurst', 'sausage-cervelat'],
		['Cervelat', 'sausage-cervelat'],
		['Haselnuss-Schokolade-Brotaufstrich', 'nut-butter'],
		['Haselnuss', 'nuts'],
		['Poulet, Brust, ohne Haut, roh', 'chicken-breast'],
		['Haferflocken', 'oats'],
		['Bier, Lager', 'beer'],
		['Wein rot, 13.5 vol%', 'wine'],
		['Kaffee, schwarz, ungezuckert', 'coffee'],
		['Joghurt, nature', 'yogurt'],
		['Pizza Margherita, gebacken', 'pizza']
	];
	it.each(cases)('%s → %s', (name, id) => {
		expect(matchSeedRule(name, null)?.id).toBe(id);
	});

	it('falls back to English names (USDA)', () => {
		expect(matchSeedRule(null, 'Bananas, raw')?.id).toBe('banana');
	});

	it.skipIf(!fs.existsSync('data/swissfcd.json'))('every generic Swiss food gets a preset', () => {
		const data = JSON.parse(fs.readFileSync('data/swissfcd.json', 'utf8')) as {
			foods: { sourceId: string; nameDe: string; nameEn: string }[];
		};
		const generic = data.foods.filter((f) => f.sourceId.startsWith('g:'));
		const missing = generic.filter((f) => !matchSeedRule(f.nameDe, f.nameEn)).map((f) => f.nameDe);
		expect(missing).toEqual([]);
	});
});

describe('buildPortions', () => {
	it('banana: seed portions + 100 g, default "mittel"', () => {
		const p = buildPortions({ ...base, nameDe: 'Banane, roh' }, 'de');
		expect(p.map((x) => x.amount)).toEqual([100, 120, 150]);
		expect(p.find((x) => x.default)?.label).toBe('mittel');
		expect(defaultAmount(p, null)).toBe(120);
		expect(defaultAmount(p, 135)).toBe(135);
	});

	it('uses English labels', () => {
		const p = buildPortions({ ...base, nameDe: 'Banane, roh' }, 'en');
		expect(p.map((x) => x.label)).toContain('medium');
	});

	it('converts ml presets with density for foods stored per 100 g', () => {
		const p = buildPortions({ ...base, nameDe: 'Apfelsaft', density: 1.04 }, 'de');
		expect(p.find((x) => x.default)?.amount).toBe(208);
	});

	it('OFF product with serving size uses it as default and skips seed', () => {
		const p = buildPortions(
			{
				...base,
				source: 'off',
				nameDe: 'Banane Chips XY',
				servingQuantity: 30,
				servingSize: '30 g'
			},
			'de'
		);
		expect(p.map((x) => x.kind)).toEqual(['serving', 'default']);
		expect(p[0].label).toBe('1 Portion (30 g)');
		expect(p[0].default).toBe(true);
	});

	it('user portions come first in priority, recipe servings', () => {
		const p = buildPortions(
			{
				...base,
				source: 'recipe',
				nameDe: 'Mein Curry',
				recipeServingWeight: 425,
				userPortions: [{ id: 1, labelDe: 'Tupperware', labelEn: null, amount: 380 }]
			},
			'de'
		);
		expect(p.map((x) => [x.kind, x.amount])).toEqual([
			['default', 100],
			['recipe', 212.5],
			['user', 380],
			['recipe', 425]
		]);
		expect(p.find((x) => x.default)?.amount).toBe(425);
	});

	it('fallback defaults when nothing is known', () => {
		const p = buildPortions({ ...base, source: 'custom', nameDe: 'Xyzzy' }, 'de');
		expect(p.map((x) => x.amount)).toEqual([100, 150]);
		expect(defaultAmount(p, null)).toBe(150);
	});
});
