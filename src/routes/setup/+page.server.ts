import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { checkSetupToken, hasCredentials } from '#lib/server/auth/setup.ts';

export const load: PageServerLoad = async ({ url, locals }) => {
	const token = url.searchParams.get('token');
	const valid = checkSetupToken(token).ok;
	if (!token && locals.session) redirect(303, '/settings/passkeys');
	if (!token && hasCredentials()) redirect(303, '/login');
	return { token: valid ? token : null, invalid: !!token && !valid };
};
