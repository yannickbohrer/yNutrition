import { eq, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { getDb, type DB } from '../db';
import { sessions } from '../db/schema';
import { hashToken, randomToken } from './tokens';

export const SESSION_COOKIE = 'nutrition_session';
export const SESSION_DAYS = 90;
const DAY = 86_400_000;
const SESSION_MS = SESSION_DAYS * DAY;

export interface Session {
	id: string;
	expiresAt: number;
}

export function createSession(
	userAgent: string | null,
	db: DB = getDb()
): { token: string; session: Session } {
	const token = randomToken();
	const id = hashToken(token);
	const expiresAt = Date.now() + SESSION_MS;
	db.insert(sessions)
		.values({ id, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null })
		.run();
	// opportunistic cleanup
	db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
	return { token, session: { id, expiresAt } };
}

/**
 * Validate a session token. Sliding expiration: once more than a day has passed since the
 * last extension, the session is extended to the full 90 days again.
 */
export function validateSession(token: string | undefined, db: DB = getDb()): Session | null {
	if (!token || token.length > 100) return null;
	const id = hashToken(token);
	const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
	if (!row) return null;
	const now = Date.now();
	if (row.expiresAt <= now) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	let expiresAt = row.expiresAt;
	if (expiresAt - now < SESSION_MS - DAY) {
		expiresAt = now + SESSION_MS;
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
	}
	return { id, expiresAt };
}

export function deleteSession(id: string, db: DB = getDb()) {
	db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function deleteAllSessions(db: DB = getDb()) {
	db.delete(sessions).run();
}

export function cookieSecure(url: URL): boolean {
	return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

export function setSessionCookie(cookies: Cookies, url: URL, token: string, expiresAt: number) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieSecure(url),
		expires: new Date(expiresAt)
	});
}

export function clearSessionCookie(cookies: Cookies, url: URL) {
	cookies.delete(SESSION_COOKIE, { path: '/', secure: cookieSecure(url) });
}
