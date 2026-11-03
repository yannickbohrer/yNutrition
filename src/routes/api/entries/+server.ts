import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addEntry, type NewEntryInput } from '#lib/server/log.ts';
import { handle, lang, readJson } from '#lib/server/http.ts';

export const POST: RequestHandler = async (event) => {
	const b = await readJson<NewEntryInput>(event);
	const entry = handle(() =>
		addEntry(
			{ foodId: Number(b.foodId), amount: Number(b.amount), date: b.date, time: b.time },
			lang()
		)
	);
	return json(entry, { status: 201 });
};
