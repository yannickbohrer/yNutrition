import { error, json } from '@sveltejs/kit';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { readJson } from '#lib/server/http.ts';
import { checkSetupToken, consumeSetupToken } from '#lib/server/auth/setup.ts';
import { CHALLENGE_COOKIE, takeChallenge, verifyRegistration } from '#lib/server/auth/webauthn.ts';
import { createSession, setSessionCookie } from '#lib/server/auth/session.ts';

export const POST: RequestHandler = async (event) => {
	const body = await readJson<{ response?: RegistrationResponseJSON; name?: string }>(event);
	const challenge = takeChallenge(event.cookies.get(CHALLENGE_COOKIE), 'register');
	event.cookies.delete(CHALLENGE_COOKIE, { path: '/api/auth' });
	if (!challenge || !body.response) error(400, 'challenge expired');
	if (!event.locals.session) {
		// token must still be valid (single-use)
		if (!challenge.setupToken || !checkSetupToken(challenge.setupToken).ok)
			error(403, 'invalid setup token');
	}
	let id: string | null = null;
	try {
		id = await verifyRegistration(body.response, challenge, {
			name: typeof body.name === 'string' ? body.name : undefined,
			userAgent: event.request.headers.get('user-agent')
		});
	} catch (e) {
		console.warn(
			'[nutrition] registration verification failed:',
			e instanceof Error ? e.message : e
		);
	}
	if (!id) error(400, 'verification failed');
	if (challenge.setupToken) consumeSetupToken(challenge.setupToken);
	if (!event.locals.session) {
		const { token, session } = createSession(event.request.headers.get('user-agent'));
		setSessionCookie(event.cookies, event.url, token, session.expiresAt);
	}
	return json({ ok: true, id });
};
