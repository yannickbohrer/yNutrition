import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, deleteSession } from '#lib/server/auth/session.ts';

export const POST: RequestHandler = async (event) => {
	if (event.locals.session) deleteSession(event.locals.session.id);
	clearSessionCookie(event.cookies, event.url);
	return json({ ok: true });
};
