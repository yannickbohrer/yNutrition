import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator } from './helpers';

test('first-run setup, passkey registration, logout and passkey login', async ({ page }) => {
	await addVirtualAuthenticator(page);

	// unauthenticated → redirected to setup (no passkey yet)
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup/);
	await expect(page.getByText('Einrichtungslink')).toBeVisible();

	// invalid token
	await page.goto('/setup?token=wrong');
	await expect(page.getByRole('alert')).toContainText('ungültig');

	// API is protected
	const api = await page.request.get('/api/days/2026-01-01');
	expect(api.status()).toBe(401);

	// register with the setup token
	await page.goto('/setup?token=e2e-setup-token');
	await page.getByTestId('device-name').fill('Test-iPhone');
	await page.getByTestId('setup-button').click();
	await expect(page.getByTestId('day-title')).toHaveText('Heute');

	// setup token is no longer valid once a passkey exists
	const reuse = await page.request.post('/api/auth/register/options', {
		data: { token: 'e2e-setup-token' }
	});
	expect(reuse.status()).toBe(200); // still logged in → allowed to add passkeys
	const anon = await page.context().browser()!.newContext();
	const r = await anon.request.post('http://localhost:4173/api/auth/register/options', {
		data: { token: 'e2e-setup-token' }
	});
	expect(r.status()).toBe(403);
	await anon.close();

	// session cookie is HttpOnly + SameSite=Lax
	const cookie = (await page.context().cookies()).find((c) => c.name === 'nutrition_session')!;
	expect(cookie.httpOnly).toBe(true);
	expect(cookie.sameSite).toBe('Lax');
	expect(cookie.expires * 1000).toBeGreaterThan(Date.now() + 80 * 86400000);

	// logout
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Abmelden' }).click();
	await expect(page).toHaveURL(/\/login/);

	// login with the same passkey
	await page.getByTestId('login-button').click();
	await expect(page.getByTestId('day-title')).toHaveText('Heute');

	// passkey shows up in settings
	await page.goto('/settings/passkeys');
	await expect(page.getByTestId('passkey-list')).toContainText('Test-iPhone');

	await page.context().storageState({ path: 'e2e/.tmp/state.json' });
});
