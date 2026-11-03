/** Phone layout: floating tab bar and every route across the common phone widths. */
import { test, expect } from '@playwright/test';
import { box, expectNoHorizontalScroll } from './helpers';

const DAY = '2025-03-16';

test('floating tab bar with the add button above it', async ({ page }) => {
	await page.goto(`/?date=${DAY}`);
	const { width: vw, height: vh } = page.viewportSize()!;
	const bar = await box(page, 'nav.tabbar');
	expect(bar.x).toBeGreaterThanOrEqual(12);
	expect(bar.x + bar.width).toBeLessThanOrEqual(vw - 12);
	expect(bar.y + bar.height).toBeLessThanOrEqual(vh - 8);
	const fab = await box(page, '[data-testid="fab-add"]');
	expect(fab.y + fab.height).toBeLessThanOrEqual(bar.y);
});

test('the end of a page is not hidden behind the tab bar', async ({ page }) => {
	await page.goto(`/?date=${DAY}`);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	const links = await box(page, '.links');
	const bar = await box(page, 'nav.tabbar');
	expect(links.y + links.height).toBeLessThanOrEqual(bar.y);
});

for (const [width, height] of [
	[320, 568],
	[360, 740],
	[390, 844],
	[430, 932]
] as const) {
	test(`no route scrolls sideways at ${width} px`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		for (const url of [
			`/?date=${DAY}`,
			'/add',
			`/copy?to=${DAY}`,
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
		]) {
			await page.goto(url);
			await expect(page.locator('nav.tabbar'), url).toBeVisible();
			await expectNoHorizontalScroll(page);
		}
		// labels must fit their tab
		const clipped = await page.$$eval(
			'nav.tabbar a span',
			(els) =>
				els.filter((e) => e.scrollWidth > (e.parentElement as HTMLElement).clientWidth).length
		);
		expect(clipped).toBe(0);
	});
}

test('the largest iPhone in landscape stays on the phone layout', async ({ page }) => {
	await page.setViewportSize({ width: 956, height: 440 });
	await page.goto(`/?date=${DAY}`);
	await expect(page.getByTestId('sidebar-add')).toBeHidden();
	await expect(page.getByTestId('inline-add')).toHaveCount(0);
	await expect(page.getByTestId('fab-add')).toBeVisible();
	await expectNoHorizontalScroll(page);
});
