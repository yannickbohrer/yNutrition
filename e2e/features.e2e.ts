import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { closeAddSheet, confirmPicker, pickFood, searchFood, zurichDate } from './helpers';

test.describe.configure({ mode: 'serial' });

test('search → portion picker → log', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('day-title')).toHaveText('Heute');
	await searchFood(page, 'banane');
	await pickFood(page, 'Banane, roh');

	// default = most common preset (mittel 120 g)
	await expect(page.getByTestId('amount-display')).toContainText('120');
	const kcal120 = await page.getByTestId('preview-kcal').textContent();
	await page.getByTestId('preset-chip').filter({ hasText: 'gross' }).click();
	await expect(page.getByTestId('amount-display')).toContainText('150');
	await expect(page.getByTestId('preview-kcal')).not.toHaveText(kcal120!);
	await expect(page.getByTestId('after-kcal')).toContainText('übrig');

	// +5 fine-tune and exact numeric input
	await page.getByTestId('plus5').click();
	await expect(page.getByTestId('amount-display')).toContainText('155');
	await page.getByTestId('amount-display').click();
	await page.getByTestId('amount-input').fill('140');
	await page.getByTestId('amount-input').press('Enter');
	await expect(page.getByTestId('amount-display')).toContainText('140');

	// slider: keyboard + click on track
	await page.getByTestId('portion-slider').focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByTestId('amount-display')).toContainText('145');

	await page.getByTestId('preset-chip').filter({ hasText: 'gross' }).click();
	await confirmPicker(page);
	await expect(page.getByText('«Banane, roh» hinzugefügt')).toBeVisible();
	await closeAddSheet(page);

	const row = page.getByTestId('entry-row').filter({ hasText: 'Banane, roh' });
	await expect(row).toContainText('150 g');
	await expect(page.getByTestId('kcal-remaining')).not.toHaveText(/^2['’]000$/);
});

test('edit, delete and undo an entry', async ({ page }) => {
	await page.goto('/');
	const row = page.getByTestId('entry-row').filter({ hasText: 'Banane, roh' });
	await row.getByRole('button', { name: /Eintrag bearbeiten/ }).click();
	await expect(page.getByTestId('portion-picker')).toBeVisible();
	await page.getByTestId('amount-display').click();
	await page.getByTestId('amount-input').fill('200');
	await page.getByTestId('amount-input').press('Enter');
	await page.locator('#picker-time').fill('07:45');
	await confirmPicker(page);
	await expect(row).toContainText('200 g');
	await expect(row).toContainText('07:45');

	// swipe left to delete
	const content = row.getByRole('button', { name: /Eintrag bearbeiten/ });
	const box = (await content.boundingBox())!;
	await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 12 });
	await page.mouse.move(box.x + 2, box.y + box.height / 2, { steps: 4 });
	await page.mouse.up();
	await expect(page.getByTestId('entry-row').filter({ hasText: 'Banane, roh' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect(page.getByTestId('entry-row').filter({ hasText: 'Banane, roh' })).toContainText(
		'200 g'
	);
});

test('favorites appear before typing', async ({ page }) => {
	await page.goto('/');
	await searchFood(page, 'ruchbrot');
	await pickFood(page, /^\s*Ruchbrot\s*$/);
	await expect(page.getByTestId('amount-display')).toContainText('40');
	await page.getByTestId('picker-favorite').click();
	await expect(page.getByTestId('picker-favorite')).toHaveAttribute('aria-pressed', 'true');
	await confirmPicker(page);
	await page.locator('#sheet-search').fill('');
	await closeAddSheet(page);
	await page.reload();
	await page.getByTestId('fab-add').click();
	await expect(page.getByTestId('favorites-list')).toContainText('Ruchbrot');
	await expect(page.locator('.add-panel')).toContainText('Banane, roh');
	// last used amount becomes the default
	await page.getByTestId('favorites-list').getByTestId('food-row').first().click();
	await expect(page.getByTestId('amount-display')).toContainText('40');
	await page.keyboard.press('Escape');
});

test('copy entries to another day', async ({ page }) => {
	const tomorrow = zurichDate(1);
	await page.goto(`/?date=${tomorrow}`);
	await expect(page.getByTestId('timeline')).toHaveCount(0);
	await page.getByTestId('copy-entries-link').click();
	await expect(page).toHaveURL(/\/copy/);
	await expect(page.getByTestId('copy-check').first()).toBeVisible();
	const n = await page.getByTestId('copy-check').count();
	expect(n).toBeGreaterThanOrEqual(2);
	for (const c of await page.getByTestId('copy-check').all()) await c.check();
	await page.getByTestId('copy-submit').click();
	await expect(page).toHaveURL(new RegExp(`date=${tomorrow}`));
	await expect(page.getByTestId('entry-row')).toHaveCount(n);
	// single-entry copy back to today via swipe action
	await page.getByTestId('prev-day').click();
	await expect(page.getByTestId('day-title')).toHaveText('Heute');
});

test('online search via Open Food Facts (mocked)', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('fab-add').click();
	await page.locator('#sheet-search').fill('rivella');
	await page.locator('#sheet-search').press('Enter');
	const online = page.getByTestId('online-results');
	await expect(online).toContainText('Rivella');
	await online.getByTestId('food-row').first().click();
	await expect(page.getByTestId('portion-picker')).toContainText('ml');
	await page.keyboard.press('Escape');
	await closeAddSheet(page);
});

test('barcode scan finds product (mocked camera + lookup)', async ({ page }) => {
	await page.addInitScript(() => {
		window.__NUTRITION_TEST_BARCODE__ = '7612100021842';
	});
	await page.goto('/');
	await page.getByTestId('fab-add').click();
	await page.getByTestId('scan-button').click();
	await expect(page.getByTestId('picker-title')).toContainText('Ovomaltine');
	await expect(page.getByTestId('amount-display')).toContainText('100');
	await confirmPicker(page);
	await closeAddSheet(page);
	await expect(page.getByTestId('entry-row').filter({ hasText: /Ovomaltine/i })).toBeVisible();
	// attribution link to OFF product page
	const food = await page.request.get('/api/foods/barcode/7612100021842');
	const { food: f } = await food.json();
	await page.goto(`/foods/${f.id}`);
	await expect(page.getByTestId('source-link')).toHaveAttribute(
		'href',
		/openfoodfacts\.org\/product\/7612100021842/
	);
});

test('unknown barcode → create custom food with this barcode', async ({ page }) => {
	await page.addInitScript(() => {
		window.__NUTRITION_TEST_BARCODE__ = '7610000000004';
	});
	await page.goto('/');
	await page.getByTestId('fab-add').click();
	await page.getByTestId('scan-button').click();
	await expect(page.getByTestId('barcode-result')).toContainText('nicht gefunden');
	await page.getByTestId('create-with-barcode').click();
	await expect(page).toHaveURL(/\/foods\/new\?barcode=7610000000004/);
	await expect(page.getByTestId('cf-barcode')).toHaveValue('7610000000004');
	await page.getByTestId('cf-name').fill('Hausriegel');
	await page.getByTestId('cf-per-serving').click();
	await page.getByTestId('cf-serving-amount').fill('40');
	await page.getByTestId('cf-energy_kcal').fill('180');
	await page.getByTestId('cf-protein').fill('8');
	await page.getByTestId('cf-carbs').fill('20');
	await page.getByTestId('cf-fat').fill('7');
	await page.getByTestId('cf-submit').click();
	// picker opens for the new food with its serving as default
	await expect(page.getByTestId('picker-title')).toContainText('Hausriegel');
	await expect(page.getByTestId('amount-display')).toContainText('40');
	await expect(page.getByTestId('preview-kcal')).toHaveText('180');
	await confirmPicker(page);
	// now the barcode resolves locally
	const r = await (await page.request.get('/api/foods/barcode/7610000000004')).json();
	expect(r.food.name).toBe('Hausriegel');
	expect(r.food.nutrients.energy_kcal).toBe(450);
});

test('recipe: compose, compute per serving, log', async ({ page }) => {
	await page.goto('/recipes');
	await page.getByTestId('new-recipe').click();
	await page.getByTestId('recipe-name').fill('Pasta Pomodoro');
	await page.getByTestId('recipe-servings').fill('2');
	for (const [q, name, amount] of [
		['teigwaren ohne ei trocken', /Teigwaren ohne Ei, trocken/, '200'],
		['tomatensauce', /Tomatensauce/, '300']
	] as const) {
		await page.getByTestId('add-ingredient').click();
		await page.locator('#ingredient-search').fill(q);
		await page
			.getByTestId('food-row')
			.filter({ has: page.locator('.row-title', { hasText: name }) })
			.first()
			.click();
		await expect(page.getByTestId('portion-picker')).toBeVisible();
		await page.getByTestId('amount-display').click();
		await page.getByTestId('amount-input').fill(amount);
		await page.getByTestId('amount-input').press('Enter');
		await confirmPicker(page);
	}
	await expect(page.getByTestId('recipe-items')).toContainText('Tomatensauce');
	await expect(page.getByTestId('recipe-totals')).toContainText('250 g');
	await page.getByTestId('save-recipe').click();
	await expect(page.getByText('Rezept gesichert')).toBeVisible();
	await page.getByTestId('log-recipe').click();
	await expect(page.getByTestId('amount-display')).toContainText('250');
	await expect(page.getByTestId('preset-chip').filter({ hasText: '½ Portion' })).toBeVisible();
	await confirmPicker(page);
	await page.goto('/');
	await expect(page.getByTestId('entry-row').filter({ hasText: 'Pasta Pomodoro' })).toContainText(
		'250 g'
	);
});

test('weight entry and insights render', async ({ page }) => {
	await page.goto('/insights/weight');
	await page.getByTestId('weight-kg').fill('78.4');
	await page.getByTestId('weight-submit').click();
	await expect(page.getByTestId('weight-list')).toContainText('78.4 kg');

	await page.goto('/insights');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(page.getByTestId('avg-kcal')).not.toContainText('–');
	await page.getByTestId('mode-month').click();
	await expect(page.getByTestId('breakdown-list')).toBeVisible();
	await page.getByTestId('breakdown-nutrient').selectOption('protein');
	await expect(page.getByTestId('breakdown-list')).toContainText('%');
});

test('export / import round-trip', async ({ page }, info) => {
	const res = await page.request.get('/api/export.json');
	expect(res.ok()).toBe(true);
	const backup = await res.json();
	expect(backup.app).toBe('nutrition');
	expect(backup.entries.length).toBeGreaterThan(3);
	const csv = await (await page.request.get('/api/export/entries.csv')).text();
	expect(csv.split('\n')[0]).toContain('date,time,food');

	const file = info.outputPath('backup.json');
	fs.writeFileSync(file, JSON.stringify(backup));
	// delete one entry, then restore the backup
	const today = zurichDate(0);
	const day = await (await page.request.get(`/api/days/${today}`)).json();
	await page.request.delete(`/api/entries/${day.entries[0].id}`);

	await page.goto('/settings/data');
	page.once('dialog', (d) => d.accept());
	await page.getByTestId('import-file').setInputFiles(file);
	await expect(page.getByText(/Backup importiert/)).toBeVisible();
	const after = await (await page.request.get('/api/export.json')).json();
	expect(after.entries.length).toBe(backup.entries.length);
	expect(after.favorites).toEqual(backup.favorites);
	expect(after.recipes.length).toBe(backup.recipes.length);
});

test('language switch to English and back', async ({ page }) => {
	await page.goto('/settings');
	await page.getByTestId('lang-en').click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await expect(page.getByTestId('tab-today')).toContainText('Today');
	await page.goto('/');
	await expect(page.getByTestId('day-title')).toHaveText('Today');
	await page.goto('/settings');
	await page.getByTestId('lang-de').click();
	await expect(page.getByTestId('tab-today')).toContainText('Heute');
});

test('targets can be changed', async ({ page }) => {
	await page.goto('/settings/targets');
	await page.getByTestId('target-kcal').fill('2200');
	await page.getByTestId('save-targets').click();
	await expect(page.getByText('Ziele gesichert')).toBeVisible();
	await page.goto('/');
	await expect(page.locator('.kcal-line')).toContainText(/2['’]200/);
});

test('recovery CLI prints a one-time link that registers a new passkey', async ({ browser }) => {
	const { spawnSync } = await import('node:child_process');
	const out = spawnSync(process.execPath, ['scripts/recovery.js'], {
		env: {
			...process.env,
			NODE_ENV: 'production',
			DATABASE_PATH: 'e2e/.tmp/test.db',
			SESSION_SECRET: 'e2e-session-secret',
			ORIGIN: 'http://localhost:4173'
		},
		encoding: 'utf8'
	});
	const link = out.stdout.match(/http:\/\/localhost:4173\/setup\?token=\S+/)?.[0];
	expect(link, out.stderr).toBeTruthy();

	const ctx = await browser.newContext({ ...test.info().project.use, storageState: undefined });
	const page = await ctx.newPage();
	const { addVirtualAuthenticator } = await import('./helpers');
	await addVirtualAuthenticator(page);
	await page.goto(link!);
	await page.getByTestId('device-name').fill('Recovery-Mac');
	await page.getByTestId('setup-button').click();
	await expect(page.getByTestId('day-title')).toBeVisible();
	await page.goto('/settings/passkeys');
	await expect(page.getByTestId('passkey-list')).toContainText('Recovery-Mac');
	await expect(page.getByTestId('passkey-list')).toContainText('Test-iPhone');
	// the link is single-use
	await page.goto(link!);
	await expect(page.getByRole('alert')).toBeVisible();
	await ctx.close();
});

test('optional nutrient limits are shown against day totals; quick weight from insights', async ({
	page
}) => {
	await page.request.patch('/api/settings', {
		data: {
			targets: {
				energy_kcal: 2200,
				protein: 100,
				carbs: 230,
				fat: 70,
				extra: { sugars: { max: 1 }, fiber: { min: 30 } }
			}
		}
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'Alle Nährwerte' }).click();
	await expect(page.locator('.target.bad').first()).toBeVisible();
	await expect(page.getByText('/ ≤ 1')).toBeVisible();
	await page.goto('/insights');
	await page.getByTestId('quick-weight').fill('77.7');
	await page.getByTestId('quick-weight').press('Enter');
	await expect(page.getByText('Gewicht gesichert')).toBeVisible();
	const w = await (await page.request.get('/api/weights')).json();
	expect(w[0].kg).toBe(77.7);
});
