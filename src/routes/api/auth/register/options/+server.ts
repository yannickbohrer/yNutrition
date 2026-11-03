import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson } from '#lib/server/http.ts';
import { checkSetupToken } from '#lib/server/auth/setup.ts';
import { CHALLENGE_COOKIE, registrationOptions } from '#lib/server/auth/webauthn.ts';
import { cookieSecure } from '#lib/server/auth/session.ts';

/** Registration is allowed with a valid session (add another passkey) or a setup/recovery token. */
export const POST: RequestHandler = async (event) => {
	const body = await readJson<{ token?: string }>(event);
	const token = typeof body.token === 'string' ? body.token : undefined;
	if (!event.locals.session) {
		if (!checkSetupToken(token).ok) error(403, 'invalid setup token');
	}
	const { options, challengeId } = await registrationOptions({
		setupToken: event.locals.session ? undefined : token
	});
	event.cookies.set(CHALLENGE_COOKIE, challengeId, {
		path: '/api/auth',
		httpOnly: true,
		sameSite: 'strict',
		secure: cookieSecure(event.url),
		maxAge: 300
	});
	return json(options);
};
