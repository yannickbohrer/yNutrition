#!/usr/bin/env node
// @ts-check
/**
 * Import the Swiss Food Composition Database (naehrwertdaten.ch, FSVO/BLV).
 *
 *   node scripts/import-swissfcd.js            convert (if needed) + load into DB
 *   node scripts/import-swissfcd.js --convert  only convert the official XLSX files → data/swissfcd.json
 *   node scripts/import-swissfcd.js --load     only load data/swissfcd.json into the DB (idempotent)
 *   node scripts/import-swissfcd.js --download also (re-)download the official XLSX files first
 *   --force                                    reload even if the same dataset version is already loaded
 *
 * The XLSX files are parsed at build time (exceljs is a dev dependency); the runtime image only
 * needs the normalized JSON.
 *
 * The XLSX files are not part of this repository (see DATA_NOTICE.md). Missing files are downloaded
 * from the FSVO and checked against the pinned SHA-256. SWISSFCD_URL_DE / SWISSFCD_URL_EN replace
 * a download URL, for example after the FSVO publishes a new version; the pin is skipped for those.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getSetting, loadDotEnv, openAndMigrate, setSetting } from './lib/db.js';
import { cellText, mapHeader, rowToNutrients, swissify } from './lib/swissfcd.js';

const DIR = path.join(ROOT, 'data', 'swissfcd');
const XLSX_DE = path.join(DIR, 'Schweizer_Nahrwertdatenbank.xlsx');
const XLSX_EN = path.join(DIR, 'Swiss_food_composition_database.xlsx');
const JSON_OUT = path.join(ROOT, 'data', 'swissfcd.json');
const ALIASES = path.join(ROOT, 'data', 'search-aliases.json');
const DOWNLOADS_PAGE = 'https://naehrwertdaten.ch/en/downloads/';
const DOWNLOADS = [
	{
		file: XLSX_DE,
		envVar: 'SWISSFCD_URL_DE',
		url: 'https://naehrwertdaten.ch/wp-content/uploads/2026/07/Schweizer_Nahrwertdatenbank.xlsx',
		sha256: 'f4bb854944ef811f9b8463984389f8121e73278c4fd24fc3e8d16336cb711270'
	},
	{
		file: XLSX_EN,
		envVar: 'SWISSFCD_URL_EN',
		url: 'https://naehrwertdaten.ch/wp-content/uploads/2026/07/Swiss_food_composition_database.xlsx',
		sha256: '323bae2eecd639d2c3b3bf3797d30b1426ccb0253fb62810f522778b38089196'
	}
];

const args = new Set(process.argv.slice(2));
const log = (/** @type {string} */ m) => console.log(`[swissfcd] ${m}`);

/** @param {typeof DOWNLOADS[number]} item */
async function downloadFile({ file, envVar, url: pinnedUrl, sha256 }) {
	const url = process.env[envVar] || pinnedUrl;
	const hint = `Check ${DOWNLOADS_PAGE} and set ${envVar} to the current file URL.`;
	log(`downloading ${url}`);
	/** @type {Buffer} */
	let body;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'yNutrition/1.0 (dataset import)' },
			signal: AbortSignal.timeout(120_000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		body = Buffer.from(await res.arrayBuffer());
	} catch (e) {
		throw new Error(`download failed for ${url}: ${e instanceof Error ? e.message : e}. ${hint}`, {
			cause: e
		});
	}
	if (url === pinnedUrl) {
		const actual = createHash('sha256').update(body).digest('hex');
		if (actual !== sha256) {
			throw new Error(`checksum mismatch for ${url}: got ${actual}. ${hint}`);
		}
	}
	// write next to the target, then rename: a failed run never leaves a partial XLSX behind
	const tmp = `${file}.download`;
	fs.writeFileSync(tmp, body);
	fs.renameSync(tmp, file);
}

/** @param {boolean} refresh also replace files that already exist */
async function download(refresh) {
	fs.mkdirSync(DIR, { recursive: true });
	for (const item of DOWNLOADS) {
		if (refresh || !fs.existsSync(item.file)) await downloadFile(item);
	}
}

/**
 * @param {string} file
 * @returns {Promise<{ version: string, rows: Map<string, { cols: ReturnType<typeof mapHeader>, row: unknown[] }> }>}
 */
async function readWorkbook(file) {
	const { default: ExcelJS } = await import('exceljs');
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.readFile(file);
	/** @type {Map<string, { cols: ReturnType<typeof mapHeader>, row: unknown[] }>} */
	const rows = new Map();
	let version = '';
	for (const [sheetIdx, ws] of wb.worksheets.slice(0, 2).entries()) {
		const prefix = sheetIdx === 0 ? 'g' : 'b'; // generic / branded
		const title = cellText(ws.getRow(1).getCell(1).value) ?? '';
		const m = title.match(/V\s*([\d.]+\s*\([^)]*\))/);
		if (m && !version) version = m[1];
		/** @type {ReturnType<typeof mapHeader> | null} */
		let cols = null;
		ws.eachRow((r) => {
			const values = /** @type {unknown[]} */ (r.values);
			if (!cols) {
				if (values.includes('ID') && values.includes('Name')) cols = mapHeader(values);
				return;
			}
			const id = values[cols.id];
			if (id === null || id === undefined || id === '') return;
			rows.set(`${prefix}:${id}`, { cols, row: values });
		});
	}
	return { version, rows };
}

async function convert() {
	await download(false);
	log('parsing XLSX (de + en)…');
	const [de, en] = await Promise.all([readWorkbook(XLSX_DE), readWorkbook(XLSX_EN)]);
	const foods = [];
	for (const [sourceId, { cols, row }] of en.rows) {
		const deRow = de.rows.get(sourceId);
		const nutrients = rowToNutrients(row, cols);
		const densityRaw = cols.density >= 0 ? row[cols.density] : null;
		foods.push({
			sourceId,
			nameEn: cellText(row[cols.name]),
			nameDe: swissify(deRow ? cellText(deRow.row[deRow.cols.name]) : null),
			synonymsDe: swissify(
				deRow && deRow.cols.synonyms >= 0 ? cellText(deRow.row[deRow.cols.synonyms]) : null
			),
			synonymsEn: cols.synonyms >= 0 ? cellText(row[cols.synonyms]) : null,
			category: swissify(
				deRow && deRow.cols.category >= 0 ? cellText(deRow.row[deRow.cols.category]) : null
			),
			branded: sourceId.startsWith('b:'),
			density: typeof densityRaw === 'number' ? densityRaw : null,
			nutrients
		});
	}
	const out = { version: en.version || de.version || 'unknown', count: foods.length, foods };
	fs.writeFileSync(JSON_OUT, JSON.stringify(out));
	log(`wrote ${foods.length} foods (version ${out.version}) → ${path.relative(ROOT, JSON_OUT)}`);
	return out;
}

/** @param {{ version: string, foods: any[] }} data */
function load(data) {
	const client = openAndMigrate();
	const version = `${data.version}+aliases:${fs.existsSync(ALIASES) ? fs.statSync(ALIASES).size : 0}`;
	const current = getSetting(client, 'swissfcd_version');
	if (current === version && !args.has('--force')) {
		log(`dataset ${data.version} already loaded — skipping`);
		client.close();
		return;
	}
	const upsert = client.prepare(`
		insert into foods (source, source_id, name_de, name_en, synonyms, brand, category, basis, density, nutrients, updated_at)
		values ('swissfcd', @sourceId, @nameDe, @nameEn, @synonyms, null, @category, 'g', @density, @nutrients, unixepoch() * 1000)
		on conflict(source, source_id) do update set
			name_de = excluded.name_de, name_en = excluded.name_en, synonyms = excluded.synonyms,
			category = excluded.category, density = excluded.density, nutrients = excluded.nutrients,
			updated_at = excluded.updated_at, deleted_at = null
	`);
	/** @type {Record<string, string>} */
	const aliases = fs.existsSync(ALIASES)
		? JSON.parse(fs.readFileSync(ALIASES, 'utf8')).aliases
		: {};
	const aliasFor = (/** @type {string | null} */ name) =>
		name
			? Object.entries(aliases)
					.filter(
						([prefix]) => name.startsWith(prefix) && !/^[\p{L}]/u.test(name.slice(prefix.length))
					)
					.map(([, syn]) => syn)
					.join(', ') || null
			: null;
	const tx = client.transaction((/** @type {any[]} */ foods) => {
		for (const f of foods) {
			upsert.run({
				sourceId: f.sourceId,
				nameDe: f.nameDe ?? f.nameEn,
				nameEn: f.nameEn,
				synonyms:
					[f.synonymsDe, f.synonymsEn, aliasFor(f.nameDe)].filter(Boolean).join('; ') || null,
				category: f.category,
				density: f.density,
				nutrients: JSON.stringify(f.nutrients)
			});
		}
	});
	tx(data.foods);
	setSetting(client, 'swissfcd_version', version);
	log(`loaded ${data.foods.length} foods (version ${data.version})`);
	client.close();
}

async function main() {
	loadDotEnv();
	if (args.has('--download')) await download(true);
	const onlyLoad = args.has('--load');
	const onlyConvert = args.has('--convert');
	let data;
	if (!onlyLoad) {
		const needs =
			args.has('--download') ||
			onlyConvert ||
			!fs.existsSync(JSON_OUT) ||
			(fs.existsSync(XLSX_EN) && fs.statSync(XLSX_EN).mtimeMs > fs.statSync(JSON_OUT).mtimeMs);
		if (needs) data = await convert();
	}
	if (onlyConvert) return;
	if (!data) {
		if (!fs.existsSync(JSON_OUT)) throw new Error(`${JSON_OUT} missing — run --convert first`);
		data = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
	}
	load(data);
}

main().catch((e) => {
	console.error(`[swissfcd] ERROR: ${e instanceof Error ? e.message : e}`);
	process.exit(1);
});
