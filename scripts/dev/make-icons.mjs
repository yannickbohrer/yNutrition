// Rasterize static/favicon.svg into PWA / Apple icons using Playwright's Chromium.
// Usage: node scripts/dev/make-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const svg = fs.readFileSync('static/favicon.svg', 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, size, markup, pad = 0, bg = 'transparent') {
	await page.setViewportSize({ width: size, height: size });
	const inner = size - pad * 2;
	await page.setContent(
		`<html><body style="margin:0;background:${bg}"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${markup.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`
	);
	await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
	console.log('wrote', file);
}
await render('static/icons/icon-192.png', 192, svg);
await render('static/icons/icon-512.png', 512, svg);
// maskable: full-bleed background, artwork inside the 80% safe zone
await render(
	'static/icons/maskable-512.png',
	512,
	square.replace('<svg ', '<svg style="transform:scale(.8)" '),
	0,
	'#2bb653'
);
// apple-touch-icon: opaque square (iOS applies its own mask)
await render('static/icons/apple-touch-icon.png', 180, square);
await browser.close();
