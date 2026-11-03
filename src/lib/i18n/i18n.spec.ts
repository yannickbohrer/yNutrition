import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { NUTRIENT_KEYS } from '../nutrients';
import { fmt, translate } from './index.svelte';

function flatten(o: object, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(o)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (typeof v === 'string') out[key] = v;
		else Object.assign(out, flatten(v, key));
	}
	return out;
}

describe('i18n catalogs', () => {
	const fde = flatten(de);
	const fen = flatten(en);
	it('have identical keys', () => {
		expect(Object.keys(fen).sort()).toEqual(Object.keys(fde).sort());
	});
	it('German uses Swiss orthography (no ß)', () => {
		const bad = Object.entries(fde).filter(([, v]) => v.includes('ß'));
		expect(bad).toEqual([]);
	});
	it('placeholders match between languages', () => {
		const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
		for (const k of Object.keys(fde)) expect(ph(fen[k]), k).toBe(ph(fde[k]));
	});
	it('every nutrient has a label', () => {
		for (const k of NUTRIENT_KEYS) {
			expect(fde[`nutrient.${k}`], k).toBeTruthy();
			expect(fen[`nutrient.${k}`], k).toBeTruthy();
		}
	});
	it('interpolates params', () => {
		expect(translate('de', 'add.noResults', { q: 'apf' })).toBe('Keine Treffer für «apf».');
		expect(translate('en', 'copy.copyButton', { n: 3 })).toBe('Copy 3');
	});
	it('formats numbers the Swiss way', () => {
		expect(fmt(12345.6, 1, 'de')).toMatch(/^12[’']345\.6$/);
		expect(fmt(1234, 0, 'en')).toMatch(/^1[’',]234$/);
		expect(fmt(null)).toBe('–');
	});
});
