/**
 * Minimal service worker: makes the app installable and caches immutable build assets for
 * fast start-up. The app is online-only — API calls and pages always go to the network.
 */
import { self as sw } from '$app/service-worker';
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `nutrition-${version}`;
const ASSETS = [
	...immutable.map((f) => f.path),
	...assets.map((f) => f.path).filter((p) => /\.(png|svg|webmanifest|wasm)$/.test(p))
].map((p) => (p.startsWith('/') ? p : '/' + p));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin || !ASSETS.includes(url.pathname)) return;
	event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
});
