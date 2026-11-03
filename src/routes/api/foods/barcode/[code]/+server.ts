import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidBarcode, lookupBarcode } from '#lib/server/foods/service.ts';
import { lang } from '#lib/server/http.ts';

export const GET: RequestHandler = async ({ params }) => {
	const code = params.code.replace(/\D/g, '');
	if (!isValidBarcode(code)) error(400, 'invalid barcode');
	return json(await lookupBarcode(code, lang()));
};
