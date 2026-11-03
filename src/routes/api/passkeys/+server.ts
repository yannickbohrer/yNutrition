import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPasskeys } from '#lib/server/auth/webauthn.ts';

export const GET: RequestHandler = async () => json(listPasskeys());
