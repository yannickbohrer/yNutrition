import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type DB } from '../db';
import { credentials, sessions } from '../db/schema';
import { createSession, validateSession, SESSION_DAYS } from './session';
import {
	checkSetupToken,
	consumeSetupToken,
	createRecoveryToken,
	ensureInitialSetup
} from './setup';
import { deletePasskey, renamePasskey, takeChallenge, registrationOptions } from './webauthn';
import { createLimiter } from '../ratelimit';
import { eq } from 'drizzle-orm';

let db: DB;
beforeEach(() => {
	db = createTestDb();
	delete process.env.SETUP_TOKEN;
});

const addCred = (id: string) =>
	db
		.insert(credentials)
		.values({ id, publicKey: Buffer.from([1]), name: id })
		.run();

describe('sessions', () => {
	it('creates and validates sessions; token is stored hashed', () => {
		const { token, session } = createSession('ua', db);
		expect(session.expiresAt).toBeGreaterThan(Date.now() + (SESSION_DAYS - 1) * 86400000);
		const row = db.select().from(sessions).get()!;
		expect(row.id).not.toBe(token);
		expect(validateSession(token, db)?.id).toBe(row.id);
		expect(validateSession('nope', db)).toBeNull();
		expect(validateSession(undefined, db)).toBeNull();
	});
	it('slides expiry and drops expired sessions', () => {
		const { token, session } = createSession(null, db);
		db.update(sessions)
			.set({ expiresAt: Date.now() + 10 * 86400000 })
			.where(eq(sessions.id, session.id))
			.run();
		expect(validateSession(token, db)!.expiresAt).toBeGreaterThan(Date.now() + 80 * 86400000);
		db.update(sessions)
			.set({ expiresAt: Date.now() - 1 })
			.where(eq(sessions.id, session.id))
			.run();
		expect(validateSession(token, db)).toBeNull();
		expect(db.select().from(sessions).all()).toHaveLength(0);
	});
});

describe('setup tokens', () => {
	it('env SETUP_TOKEN works only while no passkey exists', () => {
		process.env.SETUP_TOKEN = 'secret-setup';
		expect(ensureInitialSetup(db)).toBe('secret-setup');
		expect(checkSetupToken('secret-setup', db).ok).toBe(true);
		expect(checkSetupToken('wrong', db).ok).toBe(false);
		addCred('a');
		expect(checkSetupToken('secret-setup', db).ok).toBe(false);
		expect(ensureInitialSetup(db)).toBeNull();
	});
	it('generates a random initial token when none is configured', () => {
		const t = ensureInitialSetup(db)!;
		expect(t.length).toBeGreaterThan(20);
		expect(checkSetupToken(t, db)).toEqual({ ok: true, kind: 'db' });
		addCred('a');
		expect(checkSetupToken(t, db).ok).toBe(false);
	});
	it('recovery tokens work with existing passkeys, are single-use and expire', () => {
		addCred('a');
		const t = createRecoveryToken(db);
		expect(checkSetupToken(t, db).ok).toBe(true);
		consumeSetupToken(t, db);
		expect(checkSetupToken(t, db).ok).toBe(false);
		const expired = createRecoveryToken(db, -1);
		expect(checkSetupToken(expired, db).ok).toBe(false);
	});
});

describe('passkeys', () => {
	it('refuses to delete the last passkey; renames', () => {
		addCred('a');
		expect(deletePasskey('a', db)).toBe('last');
		addCred('b');
		expect(renamePasskey('b', '  Mac  ', db)).toBe(true);
		expect(db.select().from(credentials).where(eq(credentials.id, 'b')).get()!.name).toBe('Mac');
		expect(deletePasskey('a', db)).toBe('ok');
		expect(deletePasskey('zzz', db)).toBe('missing');
	});
	it('registration challenges are single-use and typed', async () => {
		const { options, challengeId } = await registrationOptions({}, db);
		expect(options.rp.id).toBe('localhost');
		expect(options.authenticatorSelection?.residentKey).toBe('required');
		expect(takeChallenge(challengeId, 'login')).toBeNull();
		const again = await registrationOptions({}, db);
		expect(takeChallenge(again.challengeId, 'register')?.challenge).toBe(again.options.challenge);
		expect(takeChallenge(again.challengeId, 'register')).toBeNull();
	});
});

describe('rate limiter', () => {
	it('limits per key within the window', () => {
		let t = 0;
		const l = createLimiter({ limit: 2, windowMs: 1000, now: () => t });
		expect(l.take('ip')).toBe(true);
		expect(l.take('ip')).toBe(true);
		expect(l.take('ip')).toBe(false);
		expect(l.take('other')).toBe(true);
		expect(l.retryAfter('ip')).toBe(1000);
		t = 1001;
		expect(l.take('ip')).toBe(true);
	});
});
