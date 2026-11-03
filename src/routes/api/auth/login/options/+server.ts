import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticationOptions, CHALLENGE_COOKIE } from '#lib/server/auth/webauthn.ts';
import { cookieSecure } from '#lib/server/auth/session.ts';

export const POST: RequestHandler = async (event) => {
	const { options, challengeId } = await authenticationOptions();
	event.cookies.set(CHALLENGE_COOKIE, challengeId, {
		path: '/api/auth',
		httpOnly: true,
		sameSite: 'strict',
		secure: cookieSecure(event.url),
		maxAge: 300
	});
	return json(options);
};
