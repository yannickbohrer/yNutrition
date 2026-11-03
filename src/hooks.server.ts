import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/db/index.ts';
import { ensureInitialSetup, hasCredentials } from '#lib/server/auth/setup.ts';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
	validateSession
} from '#lib/server/auth/session.ts';
import { createLimiter } from '#lib/server/ratelimit.ts';
import { config } from '#lib/server/config.ts';

export const init: ServerInit = () => {
	getDb(); // open + migrate
	ensureInitialSetup();
	console.log(`[nutrition] ready — origin ${config.origin}, RP ID ${config.rpId}`);
};

/** Routes reachable without a session. Static assets are served before hooks run. */
const PUBLIC = [/^\/login\/?$/, /^\/setup\/?$/, /^\/api\/auth\//, /^\/api\/health\/?$/];

// Auth endpoints: 30 requests / 5 min / IP
const authLimiter = createLimiter({ limit: 30, windowMs: 5 * 60_000 });

function clientIp(event: Parameters<Handle>[0]['event']): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith('/api/auth/')) {
		if (!authLimiter.take(clientIp(event))) {
			return json(
				{ message: 'rate limited', code: 'rate_limited' },
				{ status: 429, headers: { 'Retry-After': '300' } }
			);
		}
	}

	const token = event.cookies.get(SESSION_COOKIE);
	const session = token ? validateSession(token) : null;
	event.locals.session = session;
	if (token && session) {
		// refresh cookie expiry (sliding session)
		setSessionCookie(event.cookies, event.url, token, session.expiresAt);
	} else if (token && !session) {
		clearSessionCookie(event.cookies, event.url);
	}

	const isPublic = PUBLIC.some((re) => re.test(pathname));
	if (!session && !isPublic) {
		if (pathname.startsWith('/api/')) {
			return json({ message: 'unauthorized', code: 'unauthorized' }, { status: 401 });
		}
		const target = hasCredentials() ? '/login' : '/setup';
		const next = pathname !== '/' ? `?next=${encodeURIComponent(pathname + event.url.search)}` : '';
		redirect(303, target + (target === '/login' ? next : ''));
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
	if (pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
	return response;
};

export const handleError: HandleServerError = (input) => {
	if (input.kind === 'unknown') console.error('[nutrition] server error', input.error);
};
