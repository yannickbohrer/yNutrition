import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OpenFoodFactsSource, offNutrients } from './off';
import { UsdaSource } from './usda';
import { RateLimitedError } from './types';
import { createLimiter } from '../ratelimit';

const fixture = (name: string) =>
	fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');

function mockFetch(body: string, status = 200) {
	return vi.fn(
		async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })
	);
}

const offOpts = {
	baseUrl: 'https://off.test',
	searchUrl: 'https://search.off.test',
	userAgent: 'Nutrition/1.0 (test@example.com)'
};

describe('OpenFoodFactsSource', () => {
	it('normalizes a product (per 100 g, units converted)', async () => {
		const fetch = mockFetch(fixture('off-product.json'));
		const off = new OpenFoodFactsSource({ ...offOpts, fetch });
		const food = await off.lookupBarcode('7612100021842');
		expect(food).not.toBeNull();
		expect(food!.source).toBe('off');
		expect(food!.barcode).toBe('7612100021842');
		expect(food!.nameDe).toMatch(/Ovomaltine/i);
		expect(food!.nutrients.energy_kcal).toBe(514);
		expect(food!.nutrients.protein).toBe(7.6);
		expect(food!.nutrients.sat_fat).toBe(14.8);
		expect(food!.nutrients.sodium).toBe(80); // 0.08 g → 80 mg
		expect(food!.servingQuantity).toBe(100);
		expect(food!.basis).toBe('g');
		// fiber unknown in this product → stays unknown
		expect(food!.nutrients.fiber).toBeUndefined();
	});

	it('sends the custom User-Agent and requests limited fields', async () => {
		const fetch = mockFetch(fixture('off-product.json'));
		const off = new OpenFoodFactsSource({ ...offOpts, fetch });
		await off.lookupBarcode('7612100021842');
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain('/api/v2/product/7612100021842?fields=');
		expect((init.headers as Record<string, string>)['User-Agent']).toBe(offOpts.userAgent);
	});

	it('returns null for unknown barcodes', async () => {
		const off = new OpenFoodFactsSource({
			...offOpts,
			fetch: mockFetch(fixture('off-product-notfound.json'))
		});
		expect(await off.lookupBarcode('0000000000000')).toBeNull();
		const off404 = new OpenFoodFactsSource({ ...offOpts, fetch: mockFetch('{}', 404) });
		expect(await off404.lookupBarcode('123')).toBeNull();
	});

	it('normalizes search hits, favors Switzerland, detects liquids', async () => {
		const fetch = mockFetch(fixture('off-search.json'));
		const off = new OpenFoodFactsSource({ ...offOpts, fetch });
		const res = await off.search('rivella');
		expect(res.length).toBeGreaterThan(2);
		const url = String((fetch.mock.calls[0] as unknown as [string])[0]);
		expect(decodeURIComponent(url)).toContain('countries_tags:"en:switzerland"');
		const rot = res.find((r) => r.sourceId === '7610097111188')!;
		expect(rot.brand).toBe('rivella');
		expect(rot.nameDe).toBe('Rivella');
		expect(rot.basis).toBe('ml'); // quantity "1.5l"
		expect(rot.nutrients.energy_kcal).toBe(37);
		expect(rot.nutrients.salt).toBe(0.03);
	});

	it('enforces its own rate limit and maps 429 to RateLimitedError', async () => {
		const off = new OpenFoodFactsSource({
			...offOpts,
			fetch: mockFetch(fixture('off-search.json')),
			searchLimiter: createLimiter({ limit: 1, windowMs: 60_000 })
		});
		await off.search('a');
		await expect(off.search('b')).rejects.toBeInstanceOf(RateLimitedError);
		const off429 = new OpenFoodFactsSource({ ...offOpts, fetch: mockFetch('{}', 429) });
		await expect(off429.lookupBarcode('1')).rejects.toBeInstanceOf(RateLimitedError);
	});

	it('converts kJ-only energy and alcohol % vol', () => {
		const n = offNutrients({ energy_100g: 418.4, alcohol_100g: 5 });
		expect(n.energy_kcal).toBe(100);
		expect(n.alcohol).toBeCloseTo(3.945, 3);
	});

	it('links to the product page for attribution', () => {
		const off = new OpenFoodFactsSource(offOpts);
		expect(off.sourceUrl({ sourceId: '123' })).toBe('https://world.openfoodfacts.org/product/123');
	});
});

describe('UsdaSource', () => {
	it('is disabled without an API key', async () => {
		const fetch = mockFetch('{}');
		const usda = new UsdaSource({ apiKey: '', baseUrl: 'https://usda.test', fetch });
		expect(usda.enabled()).toBe(false);
		expect(await usda.search('banana')).toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('normalizes search results', async () => {
		const fetch = mockFetch(fixture('usda-search.json'));
		const usda = new UsdaSource({ apiKey: 'KEY', baseUrl: 'https://usda.test', fetch });
		const res = await usda.search('banana raw');
		expect(res).toHaveLength(2);
		const b = res[0];
		expect(b.source).toBe('usda');
		expect(b.nameEn).toBe('Bananas, raw');
		expect(b.nameDe).toBeNull();
		expect(b.nutrients.energy_kcal).toBe(89);
		expect(b.nutrients.carbs).toBe(22.8);
		expect(b.nutrients.sat_fat).toBe(0.112);
		expect(b.nutrients.potassium).toBeGreaterThan(300);
		expect(b.nutrients.salt).toBeDefined(); // derived from sodium
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain('api_key=KEY');
		expect(JSON.parse(String(init.body)).query).toBe('banana raw');
	});
});
