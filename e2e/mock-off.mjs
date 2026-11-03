// Mock Open Food Facts API for E2E tests — serves recorded fixtures, no network access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../src/lib/server/foods/fixtures');
/** @param {string} f */
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const port = Number(process.env.MOCK_PORT || 4199);

http
	.createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://x');
		res.setHeader('content-type', 'application/json');
		if (url.pathname === '/health') return res.end('{"ok":true}');
		const m = url.pathname.match(/^\/api\/v2\/product\/(\d+)$/);
		if (m) {
			if (m[1] === '7612100021842') return res.end(read('off-product.json'));
			return res.end(read('off-product-notfound.json'));
		}
		if (url.pathname === '/search') return res.end(read('off-search.json'));
		res.statusCode = 404;
		res.end('{}');
	})
	.listen(port, () => console.log(`mock OFF listening on ${port}`));
