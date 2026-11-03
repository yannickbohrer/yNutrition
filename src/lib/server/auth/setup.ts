/**
 * First-run setup and recovery tokens.
 *  - If no passkey exists, registration requires a setup token: SETUP_TOKEN from the env, or
 *    a random one generated on first start and printed to the logs.
 *  - Recovery tokens (scripts/recovery.js) are single-use, expire after 1 h and work even when
 *    passkeys already exist.
 */
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { config } from '../config';
import { getDb, type DB } from '../db';
import { credentials, setupTokens } from '../db/schema';
import { hashToken, randomToken, safeEqual } from './tokens';

export function hasCredentials(db: DB = getDb()): boolean {
	return db.select({ id: credentials.id }).from(credentials).limit(1).get() !== undefined;
}

export function setupUrl(token: string): string {
	return `${config.origin.replace(/\/$/, '')}/setup?token=${encodeURIComponent(token)}`;
}

/** Called at startup: make sure a first-run token exists and print the setup link. */
export function ensureInitialSetup(db: DB = getDb()): string | null {
	if (hasCredentials(db)) return null;
	let token = config.setupToken;
	if (!token) {
		token = randomToken(24);
		db.insert(setupTokens)
			.values({ tokenHash: hashToken(token), purpose: 'initial', expiresAt: null })
			.run();
	}
	console.log(
		`\n[nutrition] No passkey registered yet. Open this link to set up your passkey:\n  ${setupUrl(token)}\n`
	);
	return token;
}

export function createRecoveryToken(db: DB = getDb(), ttlMs = 3_600_000): string {
	const token = randomToken(24);
	db.insert(setupTokens)
		.values({ tokenHash: hashToken(token), purpose: 'recovery', expiresAt: Date.now() + ttlMs })
		.run();
	return token;
}

export type SetupTokenCheck = { ok: true; kind: 'env' | 'db' } | { ok: false };

export function checkSetupToken(
	token: string | null | undefined,
	db: DB = getDb()
): SetupTokenCheck {
	if (!token || token.length > 200) return { ok: false };
	if (config.setupToken && !hasCredentials(db) && safeEqual(token, config.setupToken)) {
		return { ok: true, kind: 'env' };
	}
	const row = db
		.select()
		.from(setupTokens)
		.where(
			and(
				eq(setupTokens.tokenHash, hashToken(token)),
				isNull(setupTokens.usedAt),
				or(isNull(setupTokens.expiresAt), gt(setupTokens.expiresAt, Date.now()))
			)
		)
		.get();
	if (!row) return { ok: false };
	// initial tokens are only valid while no passkey exists
	if (row.purpose === 'initial' && hasCredentials(db)) return { ok: false };
	return { ok: true, kind: 'db' };
}

export function consumeSetupToken(token: string, db: DB = getDb()) {
	db.update(setupTokens)
		.set({ usedAt: Date.now() })
		.where(eq(setupTokens.tokenHash, hashToken(token)))
		.run();
}
