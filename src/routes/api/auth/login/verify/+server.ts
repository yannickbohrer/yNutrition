import { error, json } from '@sveltejs/kit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { readJson } from '#lib/server/http.ts';
import {
	CHALLENGE_COOKIE,
	takeChallenge,
	verifyAuthentication
} from '#lib/server/auth/webauthn.ts';
import { createSession, setSessionCookie } from '#lib/server/auth/session.ts';

export const POST: RequestHandler = async (event) => {
	const body = await readJson<{ response?: AuthenticationResponseJSON }>(event);
	const challenge = takeChallenge(event.cookies.get(CHALLENGE_COOKIE), 'login');
	event.cookies.delete(CHALLENGE_COOKIE, { path: '/api/auth' });
	if (!challenge || !body.response) error(400, 'challenge expired');
	let id: string | null = null;
	try {
		id = await verifyAuthentication(body.response, challenge);
	} catch (e) {
		console.warn('[nutrition] authentication failed:', e instanceof Error ? e.message : e);
	}
	if (!id) error(401, 'authentication failed');
	const { token, session } = createSession(event.request.headers.get('user-agent'));
	setSessionCookie(event.cookies, event.url, token, session.expiresAt);
	return json({ ok: true });
};
