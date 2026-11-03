/**
 * Captures every main screen in light and dark mode (iPhone viewport) into docs/screenshots.
 * Run: npx playwright test --project=screenshots
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { zurichDate } from './helpers';

const OUT = 'docs/screenshots';
test.describe.configure({ mode: 'serial' });

async function food(page: Page, q: string): Promise<number> {
	const r = await (await page.request.get(`/api/foods/search?q=${encodeURIComponent(q)}`)).json();
	return (r.mine[0] ?? r.local[0]).id;
}

test('seed demo data', async ({ page }) => {
	fs.mkdirSync(OUT, { recursive: true });
	const today = zurichDate(0);
	const plan: [string, number, string][] = [
		['haferflocken', 50, '07:20'],
		['vollmilch', 200, '07:20'],
		['banane', 120, '07:25'],
		['kaffee', 150, '09:30'],
		['ruchbrot', 80, '12:15'],
		['emmentaler', 40, '12:15'],
		['apfel', 170, '15:40'],
		['poulet brust', 160, '19:00'],
		['reis poliert gekocht', 180, '19:00']
	];
	for (const [q, amount, time] of plan) {
		const id = await food(page, q);
		await page.request.post('/api/entries', { data: { foodId: id, amount, date: today, time } });
	}
	await page.request.put(`/api/foods/${await food(page, 'banane')}/favorite`, {
		data: { on: true }
	});
	await page.request.put(`/api/foods/${await food(page, 'haferflocken')}/favorite`, {
		data: { on: true }
	});
	// past days for insights
	for (let d = 1; d <= 13; d++) {
		const date = zurichDate(-d);
		for (const [q, amount] of [
			['haferflocken', 50 + (d % 3) * 10],
			['ruchbrot', 80 + (d % 4) * 20],
			['poulet brust', 140],
			['teigwaren ohne ei gekocht', 200 + (d % 5) * 40],
			['milchschokolade', d % 3 === 0 ? 50 : 15]
		] as const) {
			await page.request.post('/api/entries', {
				data: { foodId: await food(page, q), amount, date, time: '12:00' }
			});
		}
		if (d % 2 === 0)
			await page.request.post('/api/weights', {
				data: { date, kg: 79.8 - d * 0.08 + (d % 3) * 0.2 }
			});
	}
	await page.request.post('/api/weights', { data: { date: today, kg: 78.9, note: 'morgens' } });
	await page.request.post('/api/recipes', {
		data: {
			name: 'Birchermüesli',
			servings: 2,
			items: [
				{ foodId: await food(page, 'haferflocken'), amount: 100 },
				{ foodId: await food(page, 'joghurt nature'), amount: 180 },
				{ foodId: await food(page, 'apfel'), amount: 150 },
				{ foodId: await food(page, 'baumnuss'), amount: 20 }
			]
		}
	});
	expect(true).toBe(true);
});

for (const scheme of ['light', 'dark'] as const) {
	test(`screens (${scheme})`, async ({ page, browser }) => {
		await page.emulateMedia({ colorScheme: scheme });
		const shot = async (name: string) => {
			await page.waitForTimeout(450);
			await page.screenshot({ path: `${OUT}/${scheme}-${name}.png` });
		};

		await page.goto('/');
		await expect(page.getByTestId('timeline')).toBeVisible();
		await shot('01-today');

		await page.getByTestId('fab-add').click();
		await expect(page.getByTestId('favorites-list')).toBeVisible();
		await page.locator('#sheet-search').blur();
		await shot('02-add-sheet');

		await page.locator('#sheet-search').fill('apf');
		await expect(page.getByTestId('local-results')).toBeVisible();
		await page.locator('#sheet-search').blur();
		await shot('03-search');

		await page.getByTestId('food-row').filter({ hasText: 'Apfel, roh' }).first().click();
		await expect(page.getByTestId('portion-picker')).toBeVisible();
		await shot('04-portion-picker');
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');

		const id = await food(page, 'emmentaler');
		await page.goto(`/foods/${id}`);
		await shot('05-food-detail');

		const recipes = await (await page.request.get('/api/recipes')).json();
		await page.goto(`/recipes/${recipes[0].id}`);
		await expect(page.getByTestId('recipe-totals')).toBeVisible();
		await shot('06-recipe');

		await page.goto('/foods/new');
		await shot('07-custom-food');

		await page.goto('/insights');
		await expect(page.locator('canvas').first()).toBeVisible();
		await shot('08-insights');
		await page.getByTestId('breakdown-list').scrollIntoViewIfNeeded();
		await shot('09-insights-breakdown');

		await page.goto('/insights/weight');
		await expect(page.getByTestId('weight-list')).toBeVisible();
		await shot('10-weight');

		await page.goto(`/copy?to=${zurichDate(1)}`);
		await page.locator('#copy-from').fill(zurichDate(0));
		await expect(page.getByTestId('copy-check').first()).toBeVisible();
		await shot('11-copy');

		await page.goto('/settings');
		await shot('12-settings');
		await page.goto('/settings/targets');
		await shot('13-targets');
		await page.goto('/settings/passkeys');
		await shot('14-passkeys');
		await page.goto('/settings/about');
		await shot('15-about');

		await page.addInitScript(() => {
			window.__NUTRITION_TEST_BARCODE__ = '';
		});

		// login screen (fresh context, no session)
		const ctx = await browser.newContext({
			...test.info().project.use,
			storageState: undefined,
			colorScheme: scheme
		});
		const p2 = await ctx.newPage();
		await p2.goto('/login');
		await p2.waitForTimeout(300);
		await p2.screenshot({ path: `${OUT}/${scheme}-16-login.png` });
		await ctx.close();
	});
}
