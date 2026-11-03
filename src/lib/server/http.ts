import { error, json, type RequestEvent } from '@sveltejs/kit';
import { ValidationError } from './log';
import { getUserSettings } from './settings';
import type { Lang } from '../types';

export async function readJson<T = Record<string, unknown>>(
	event: RequestEvent,
	maxBytes = 1_000_000
): Promise<T> {
	const len = Number(event.request.headers.get('content-length') ?? 0);
	if (len > maxBytes) error(413, 'payload too large');
	try {
		const text = await event.request.text();
		if (text.length > maxBytes) error(413, 'payload too large');
		return JSON.parse(text || '{}') as T;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(400, 'invalid JSON');
	}
}

export function lang(): Lang {
	return getUserSettings().lang;
}

export function intParam(v: string | undefined): number {
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) error(400, 'invalid id');
	return n;
}

/** Run a handler, mapping ValidationError to 400. */
export function handle<T>(fn: () => T): T {
	try {
		return fn();
	} catch (e) {
		if (e instanceof ValidationError) error(400, e.message);
		throw e;
	}
}

export const ok = (data: unknown = { ok: true }, init?: ResponseInit) => json(data, init);
