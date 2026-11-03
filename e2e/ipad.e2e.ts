/**
 * iPad layouts. Runs in the `ipad-portrait` and `ipad-landscape` projects (iPad Pro 11).
 * Logs to a fixed past day so it never interferes with the iPhone feature tests.
 */
import { test, expect, type Page } from '@playwright/test';
import { confirmPicker, pickFood } from './helpers';

test.describe.configure({ mode: 'serial' });

const DAY = '2025-03-14';
const isLandscape = () => test.info().project.name === 'ipad-landscape';

async function box(page: Page, selector: string) {
	const b = await page.locator(selector).first().boundingBox();
	expect(b, selector).not.toBeNull();
	return b!;
}

/** The page must never scroll sideways. */
async function expectNoHorizontalScroll(page: Page) {
	const { sw, w } = await page.evaluate(() => ({
		sw: document.documentElement.scrollWidth,
		w: window.innerWidth
	}));
	expect(sw).toBeLessThanOrEqual(w);
}

test.describe('portrait', () => {
	test.beforeEach(() => test.skip(isLandscape(), 'portrait only'));

	test('floating tab bar, FAB and centred add sheet', async ({ page }) => {
		await page.goto(`/?date=${DAY}`);
		const vw = page.viewportSize()!.width;

		const bar = await box(page, 'nav.tabbar');
		expect(bar.width).toBeLessThan(vw * 0.85); // floating pill, not edge to edge
		expect(Math.abs(bar.x + bar.width / 2 - vw / 2)).toBeLessThan(2); // centred
		await expect(page.getByTestId('sidebar-add')).toBeHidden();
		await expect(page.getByTestId('inline-add')).toHaveCount(0);

		// macros side by side in the summary card
		const macros = page.locator('.macro-row');
		const [m1, m2] = [await macros.nth(0).boundingBox(), await macros.nth(1).boundingBox()];
		expect(Math.abs(m1!.y - m2!.y)).toBeLessThan(2);
		expect(m2!.x).toBeGreaterThan(m1!.x);

		await page.getByTestId('fab-add').click();
		const sheet = await box(page, '[role="dialog"]');
		expect(sheet.width).toBeLessThanOrEqual(621);
		expect(sheet.x).toBeGreaterThan(50); // form sheet, not a full-width bottom sheet
		await page.getByTestId('add-sheet-done').click();
		await expectNoHorizontalScroll(page);
	});

	test('insights: chart full width, figures in two columns', async ({ page }) => {
		await page.goto('/insights');
		await expect(page.locator('canvas').first()).toBeVisible();
		const chart = await box(page, '.a-chart');
		const tiles = await box(page, '.a-tiles');
		const macros = await box(page, '.a-macros');
		expect(tiles.y).toBeGreaterThan(chart.y + chart.height - 1);
		expect(macros.x).toBeGreaterThan(tiles.x + tiles.width - 1);
		await expectNoHorizontalScroll(page);
	});

	test('settings stay a list with drill-down', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByTestId('settings-split-nav')).toHaveCount(0);
		await page.getByRole('link', { name: /Ziele/ }).click();
		await expect(page.getByRole('heading', { name: 'Ziele', exact: true })).toBeVisible();
		await expect(page.locator('.back-nav a')).toBeVisible();
	});
});

test.describe('landscape', () => {
	test.beforeEach(() => test.skip(!isLandscape(), 'landscape only'));

	test('sidebar navigation', async ({ page }) => {
		await page.goto(`/?date=${DAY}`);
		const vh = page.viewportSize()!.height;
		const nav = await box(page, 'nav.tabbar');
		expect(nav.x).toBe(0);
		expect(nav.height).toBeGreaterThanOrEqual(vh - 1);
		expect(nav.width).toBeLessThan(260);
		const main = await box(page, 'main');
		expect(main.x).toBeGreaterThanOrEqual(nav.width);

		await page.getByTestId('tab-chart').click();
		await expect(page).toHaveURL(/\/insights/);
		await expect(page.getByTestId('tab-chart')).toHaveAttribute('aria-current', 'page');
		await expectNoHorizontalScroll(page);
	});

	test('today: log with the inline add panel next to the day', async ({ page }) => {
		await page.goto(`/?date=${DAY}`);
		await expect(page.getByTestId('fab-add')).toBeHidden();
		const panel = page.getByTestId('inline-add');
		await expect(panel).toBeVisible();
		const log = await box(page, '.day-main');
		const side = (await panel.boundingBox())!;
		expect(side.x).toBeGreaterThan(log.x + log.width - 1);
		await expect(panel.locator('.add-title')).toHaveText('Hinzufügen zu 14. März');

		await page.locator('#inline-search').fill('banane');
		await expect(panel.getByTestId('local-results')).toBeVisible();
		await pickFood(page, 'Banane, roh');
		const dialog = await box(page, '[role="dialog"]');
		expect(dialog.x).toBeGreaterThan(100); // centred form sheet
		await confirmPicker(page);
		await expect(page.getByTestId('entry-row').filter({ hasText: 'Banane, roh' })).toBeVisible();
		await expectNoHorizontalScroll(page);

		// clean up so the day stays empty for re-runs
		const day = await (await page.request.get(`/api/days/${DAY}`)).json();
		for (const e of day.entries) await page.request.delete(`/api/entries/${e.id}`);
	});

	test('sidebar quick add targets the viewed day', async ({ page }) => {
		await page.goto(`/?date=${DAY}`);
		await page.getByTestId('sidebar-add').click();
		await expect(page.getByRole('dialog')).toContainText('14. März');
		await page.getByTestId('add-sheet-done').click();
	});

	test('insights: chart beside the figures', async ({ page }) => {
		await page.goto('/insights');
		await expect(page.locator('canvas').first()).toBeVisible();
		const chart = await box(page, '.a-chart');
		const tiles = await box(page, '.a-tiles');
		expect(tiles.x).toBeGreaterThan(chart.x + chart.width - 1);
		expect(Math.abs(tiles.y - chart.y)).toBeLessThan(30);
		await expectNoHorizontalScroll(page);
	});

	test('settings split view', async ({ page }) => {
		await page.goto('/settings');
		const nav = page.getByTestId('settings-split-nav');
		await expect(nav).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Allgemein' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByTestId('lang-de')).toBeVisible();

		await nav.getByRole('link', { name: 'Ziele' }).click();
		await expect(page.getByRole('heading', { name: 'Ziele', exact: true })).toBeVisible();
		await expect(nav).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Ziele' })).toHaveAttribute('aria-current', 'page');
		await expect(page.locator('.back-nav a')).toBeHidden();
		await expectNoHorizontalScroll(page);
	});

	test('rotating to portrait switches layouts live', async ({ page }) => {
		await page.goto(`/?date=${DAY}`);
		await expect(page.getByTestId('inline-add')).toBeVisible();
		await page.setViewportSize({ width: 834, height: 1194 });
		await expect(page.getByTestId('inline-add')).toHaveCount(0);
		await expect(page.getByTestId('fab-add')).toBeVisible();
		await expect(page.getByTestId('sidebar-add')).toBeHidden();
		await page.setViewportSize({ width: 1194, height: 834 });
		await expect(page.getByTestId('inline-add')).toBeVisible();
	});

	test('smallest iPad landscape (944 × 656) still fits', async ({ page }) => {
		await page.setViewportSize({ width: 944, height: 656 });
		for (const url of [`/?date=${DAY}`, '/insights', '/settings/targets', '/add']) {
			await page.goto(url);
			await expect(page.getByTestId('sidebar-add')).toBeVisible();
			await expectNoHorizontalScroll(page);
		}
	});
});

test('iPhone landscape keeps the phone layout', async ({ page }) => {
	test.skip(isLandscape(), 'once is enough');
	await page.setViewportSize({ width: 852, height: 393 });
	await page.goto(`/?date=${DAY}`);
	const bar = await box(page, 'nav.tabbar');
	expect(bar.width).toBe(852);
	await expect(page.getByTestId('sidebar-add')).toBeHidden();
});
