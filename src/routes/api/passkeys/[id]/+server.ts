import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deletePasskey, renamePasskey } from '#lib/server/auth/webauthn.ts';
import { readJson } from '#lib/server/http.ts';

export const PATCH: RequestHandler = async (event) => {
	const b = await readJson<{ name?: string }>(event);
	if (!renamePasskey(event.params.id, String(b.name ?? ''))) error(400, 'invalid name');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const r = deletePasskey(params.id);
	if (r === 'last') error(409, 'cannot delete last passkey');
	if (r === 'missing') error(404, 'not found');
	return json({ ok: true });
};
