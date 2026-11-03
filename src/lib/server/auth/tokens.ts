import crypto from 'node:crypto';
import { config } from '../config';

export function randomToken(bytes = 32): string {
	return crypto.randomBytes(bytes).toString('base64url');
}

/** HMAC with the session secret, so a leaked DB alone can't be used to forge cookies. */
export function hashToken(token: string): string {
	return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) {
		crypto.timingSafeEqual(ab, ab);
		return false;
	}
	return crypto.timingSafeEqual(ab, bb);
}
