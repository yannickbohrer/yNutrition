import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasCredentials } from '#lib/server/auth/setup.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.session) redirect(303, safeNext(url.searchParams.get('next')));
	if (!hasCredentials()) redirect(303, '/setup');
	return {};
};

function safeNext(n: string | null): string {
	return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}
