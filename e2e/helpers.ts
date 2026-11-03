import { expect, type Page, type CDPSession } from '@playwright/test';

export async function addVirtualAuthenticator(
	page: Page
): Promise<{ cdp: CDPSession; id: string }> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return { cdp, id: authenticatorId };
}

export function zurichDate(offsetDays = 0): string {
	const d = new Date(Date.now() + offsetDays * 86400000);
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(d);
}

/** Open the add sheet via the FAB and search for a food. */
export async function searchFood(page: Page, q: string) {
	await page.getByTestId('fab-add').click();
	const input = page.locator('#sheet-search');
	await expect(input).toBeVisible();
	await input.fill(q);
	await expect(page.getByTestId('local-results').or(page.getByText('Keine Treffer'))).toBeVisible();
}

export async function pickFood(page: Page, name: string | RegExp) {
	await page
		.getByTestId('food-row')
		.filter({ has: page.locator('.row-title', { hasText: name }) })
		.first()
		.click();
	await expect(page.getByTestId('portion-picker')).toBeVisible();
}

export async function confirmPicker(page: Page) {
	await page.getByTestId('picker-confirm').click();
	await expect(page.getByTestId('portion-picker')).toBeHidden();
}

export async function closeAddSheet(page: Page) {
	await page.getByTestId('add-sheet-done').click();
	await expect(page.locator('#sheet-search')).toBeHidden();
}
