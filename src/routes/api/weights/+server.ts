import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addWeight, listWeights } from '#lib/server/weights.ts';
import { handle, readJson } from '#lib/server/http.ts';

export const GET: RequestHandler = async () => json(listWeights());

export const POST: RequestHandler = async (event) => {
	const b = await readJson<{ date: string; kg: number; note?: string }>(event);
	return json(
		handle(() => addWeight({ date: b.date, kg: Number(b.kg), note: b.note })),
		{ status: 201 }
	);
};
