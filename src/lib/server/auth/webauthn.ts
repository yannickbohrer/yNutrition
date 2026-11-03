/** WebAuthn passkey registration & authentication (single user). */
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { desc, eq } from 'drizzle-orm';
import { config } from '../config';
import { getDb, type DB } from '../db';
import { credentials } from '../db/schema';
import { getSetting, setSetting } from '../settings';
import { randomToken } from './tokens';
import type { PasskeyDTO } from '../../types';

export const CHALLENGE_COOKIE = 'nutrition_challenge';
const CHALLENGE_TTL = 5 * 60_000;

interface PendingChallenge {
	challenge: string;
	kind: 'register' | 'login';
	expires: number;
	setupToken?: string;
}

const pending = new Map<string, PendingChallenge>();

function storeChallenge(c: Omit<PendingChallenge, 'expires'>): string {
	const now = Date.now();
	for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
	if (pending.size > 100) pending.clear();
	const id = randomToken(16);
	pending.set(id, { ...c, expires: now + CHALLENGE_TTL });
	return id;
}

export function takeChallenge(
	id: string | undefined,
	kind: PendingChallenge['kind']
): PendingChallenge | null {
	if (!id) return null;
	const c = pending.get(id);
	pending.delete(id);
	if (!c || c.kind !== kind || c.expires < Date.now()) return null;
	return c;
}

/** Stable random WebAuthn user handle for the single user. */
function userId(db: DB): Uint8Array {
	let id = getSetting<string>('webauthn_user_id', db);
	if (!id) {
		id = randomToken(16);
		setSetting('webauthn_user_id', id, db);
	}
	return new Uint8Array(Buffer.from(id, 'base64url'));
}

export async function registrationOptions(opts: { setupToken?: string }, db: DB = getDb()) {
	const existing = db.select().from(credentials).all();
	const options = await generateRegistrationOptions({
		rpName: config.rpName,
		rpID: config.rpId,
		userName: 'owner',
		userDisplayName: 'Nutrition',
		userID: userId(db) as Uint8Array<ArrayBuffer>,
		attestationType: 'none',
		excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
	});
	const challengeId = storeChallenge({
		challenge: options.challenge,
		kind: 'register',
		setupToken: opts.setupToken
	});
	return { options, challengeId };
}

function defaultName(userAgent: string | null): string {
	const ua = userAgent ?? '';
	if (/iPhone/.test(ua)) return 'iPhone';
	if (/iPad/.test(ua)) return 'iPad';
	if (/Macintosh/.test(ua)) return 'Mac';
	if (/Android/.test(ua)) return 'Android';
	if (/Windows/.test(ua)) return 'Windows';
	return 'Passkey';
}

export async function verifyRegistration(
	response: RegistrationResponseJSON,
	challenge: PendingChallenge,
	meta: { name?: string; userAgent: string | null },
	db: DB = getDb()
) {
	const v = await verifyRegistrationResponse({
		response,
		expectedChallenge: challenge.challenge,
		expectedOrigin: config.origin,
		expectedRPID: config.rpId,
		requireUserVerification: false
	});
	if (!v.verified) return null;
	const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
	const name = (meta.name?.trim() || defaultName(meta.userAgent)).slice(0, 60);
	db.insert(credentials)
		.values({
			id: credential.id,
			publicKey: Buffer.from(credential.publicKey),
			counter: credential.counter,
			transports: credential.transports ?? null,
			name,
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
			lastUsedAt: Date.now()
		})
		.run();
	return credential.id;
}

export async function authenticationOptions() {
	const options = await generateAuthenticationOptions({
		rpID: config.rpId,
		userVerification: 'preferred'
		// no allowCredentials: discoverable credentials (passkeys) let the OS pick
	});
	const challengeId = storeChallenge({ challenge: options.challenge, kind: 'login' });
	return { options, challengeId };
}

export async function verifyAuthentication(
	response: AuthenticationResponseJSON,
	challenge: PendingChallenge,
	db: DB = getDb()
): Promise<string | null> {
	const cred = db.select().from(credentials).where(eq(credentials.id, response.id)).get();
	if (!cred) return null;
	const v = await verifyAuthenticationResponse({
		response,
		expectedChallenge: challenge.challenge,
		expectedOrigin: config.origin,
		expectedRPID: config.rpId,
		credential: {
			id: cred.id,
			publicKey: new Uint8Array(cred.publicKey),
			counter: cred.counter,
			transports: cred.transports ?? undefined
		},
		requireUserVerification: false
	});
	if (!v.verified) return null;
	db.update(credentials)
		.set({
			counter: v.authenticationInfo.newCounter,
			lastUsedAt: Date.now(),
			backedUp: v.authenticationInfo.credentialBackedUp
		})
		.where(eq(credentials.id, cred.id))
		.run();
	return cred.id;
}

export function listPasskeys(db: DB = getDb()): PasskeyDTO[] {
	return db
		.select()
		.from(credentials)
		.orderBy(desc(credentials.createdAt))
		.all()
		.map((c) => ({
			id: c.id,
			name: c.name,
			createdAt: c.createdAt,
			lastUsedAt: c.lastUsedAt,
			deviceType: c.deviceType,
			backedUp: c.backedUp
		}));
}

export function renamePasskey(id: string, name: string, db: DB = getDb()): boolean {
	const n = name.trim().slice(0, 60);
	if (!n) return false;
	return db.update(credentials).set({ name: n }).where(eq(credentials.id, id)).run().changes > 0;
}

/** Deleting the last passkey is refused (would lock the owner out). */
export function deletePasskey(id: string, db: DB = getDb()): 'ok' | 'last' | 'missing' {
	const all = db.select({ id: credentials.id }).from(credentials).all();
	if (!all.some((c) => c.id === id)) return 'missing';
	if (all.length <= 1) return 'last';
	db.delete(credentials).where(eq(credentials.id, id)).run();
	return 'ok';
}
