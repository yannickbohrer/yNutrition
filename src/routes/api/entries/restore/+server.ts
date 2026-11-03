import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreEntry } from '#lib/server/log.ts';
import type { LogEntryRow } from '#lib/server/db/schema.ts';
import { handle, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const b = await readJson<{ row?: LogEntryRow }>(event);
	if (!b.row || typeof b.row.id !== 'number') error(400, 'row required');
	return json(handle(() => restoreEntry(b.row!)));
};
