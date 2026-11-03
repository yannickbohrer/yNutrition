/**
 * Laptop and monitor layouts. Runs in the `laptop` (1440), `desktop` (1920) and `ultrawide` (3440)
 * projects, with a mouse and no touch. Logs to a fixed past day, like the iPad tests.
 */
import { test, expect, type Page } from '@playwright/test';
import { box, expectNoHorizontalScroll } from './helpers';

test.describe.configure({ mode: 'serial' });

const DAY = '2025-03-15';
const isUltra = () => test.info().project.name !== 'laptop';

async function foodId(page: Page, q: string): Promise<number> {
	const r = await (await page.request.get(`/api/foods/search?q=${encodeURIComponent(q)}`)).json();
	return (r.mine[0] ?? r.local[0]).id;
}

async function logEntry(page: Page) {
	const id = await foodId(page, 'banane');
	await page.request.post('/api/entries', {
		data: { foodId: id, amount: 120, date: DAY, time: '08:00' }
	});
}

async function clearDay(page: Page) {
	const day = await (await page.request.get(`/api/days/${DAY}`)).json();
	for (const e of day.entries) await page.request.delete(`/api/entries/${e.id}`);
}

test.afterEach(async ({ page }) => clearDay(page));

test('no route scrolls sideways, and the sidebar stays beside the content', async ({ page }) => {
	const id = await foodId(page, 'banane');
	const routes = [
		`/?date=${DAY}`,
		'/add',
		`/copy?to=${DAY}`,
		`/foods/${id}`,
		'/foods/new',
		'/recipes',
		'/recipes/new',
		'/insights',
		'/insights/weight',
		'/settings',
		'/settings/targets',
		'/settings/data',
		'/settings/passkeys',
		'/settings/about'
	];
	for (const url of routes) {
		await page.goto(url);
		await expect(page.getByTestId('sidebar-add'), url).toBeVisible();
		await expectNoHorizontalScroll(page);
	}
});

test('the shell is capped and centred, with the sidebar next to the content', async ({ page }) => {
	await page.goto(`/?date=${DAY}`);
	const vw = page.viewportSize()!.width;
	const inset = Math.max(0, (vw - 2560) / 2);
	const nav = await box(page, 'nav.tabbar');
	expect(Math.abs(nav.x - inset)).toBeLessThan(10); // scrollbar gutter tolerance
	const main = await box(page, 'main');
	expect(main.x - (nav.x + nav.width)).toBeLessThan(40);
	expect(main.x + main.width).toBeLessThanOrEqual(vw - inset + 10);
});

test('today: panes follow the tier', async ({ page }) => {
	await logEntry(page);
	await page.goto(`/?date=${DAY}`);
	const add = page.getByTestId('inline-add');
	await expect(add).toBeVisible();
	const log = await box(page, '.day-main');
	const panel = (await add.boundingBox())!;
	expect(panel.x).toBeGreaterThan(log.x + log.width - 1);

	const pane = page.getByTestId('nutrients-pane');
	if (isUltra()) {
		await expect(pane).toBeVisible();
		const nutrients = (await pane.boundingBox())!;
		expect(nutrients.x).toBeGreaterThan(log.x + log.width - 1);
		expect(panel.x).toBeGreaterThan(nutrients.x + nutrients.width - 1);
		await expect(pane.locator('.nrow').first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Alle Nährwerte' })).toHaveCount(0);
	} else {
		await expect(pane).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Alle Nährwerte' })).toBeVisible();
	}
	// the log keeps the side-by-side macros at every tier
	const macros = page.locator('.macro-row');
	const [m1, m2] = [await macros.nth(0).boundingBox(), await macros.nth(1).boundingBox()];
	expect(Math.abs(m1!.y - m2!.y)).toBeLessThan(2);
});

test('insights: columns follow the tier', async ({ page }) => {
	await page.goto('/insights');
	await expect(page.locator('canvas').first()).toBeVisible();
	const chart = await box(page, '.a-chart');
	const tiles = await box(page, '.a-tiles');
	const bd = await box(page, '.a-bd');
	expect(tiles.x).toBeGreaterThan(chart.x + chart.width - 1);
	if (isUltra()) {
		expect(bd.x).toBeGreaterThan(tiles.x + tiles.width - 1);
		expect(Math.abs(bd.y - chart.y)).toBeLessThan(30);
	} else {
		expect(bd.y).toBeGreaterThan(chart.y + chart.height - 1);
	}
});

test('detail pages use two columns', async ({ page }) => {
	await page.goto(`/foods/${await foodId(page, 'banane')}`);
	const [left, right] = [
		await page.locator('.food-cols > div').nth(0).boundingBox(),
		await page.locator('.food-cols > div').nth(1).boundingBox()
	];
	expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
	expect(Math.abs(right!.y - left!.y)).toBeLessThan(2);

	await page.goto('/recipes/new');
	const items = await box(page, '.r-items');
	const details = await box(page, '.r-details');
	expect(details.x).toBeGreaterThan(items.x + items.width - 1);
});

test('entries can be deleted with the mouse', async ({ page }) => {
	await logEntry(page);
	await page.goto(`/?date=${DAY}`);
	await expect(page.getByText('Zum Löschen mit der Maus auf eine Zeile zeigen')).toBeVisible();
	const rows = page.getByTestId('entry-row');
	await expect(rows.first()).toBeVisible();
	const before = await rows.count();
	const row = rows.first();
	const del = row.getByTestId('entry-hover-delete');
	await expect(del).toHaveCSS('opacity', '0');
	await row.hover();
	await expect(del).toHaveCSS('opacity', '1');
	await del.click();
	await expect(rows).toHaveCount(before - 1);
});

test('entries can be deleted with the keyboard', async ({ page }) => {
	await logEntry(page);
	await page.goto(`/?date=${DAY}`);
	const rows = page.getByTestId('entry-row');
	await expect(rows.first()).toBeVisible();
	const before = await rows.count();
	await rows.first().locator('button.content').focus();
	await page.keyboard.press('Tab');
	await expect(rows.first().getByTestId('entry-hover-delete')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(rows).toHaveCount(before - 1);
});

test('a short laptop window keeps the sidebar', async ({ page }) => {
	test.skip(isUltra(), 'once is enough');
	await page.setViewportSize({ width: 1280, height: 540 });
	await page.goto(`/?date=${DAY}`);
	await expect(page.getByTestId('sidebar-add')).toBeVisible();
	await expect(page.getByTestId('inline-add')).toBeVisible();
	await expectNoHorizontalScroll(page);
});
