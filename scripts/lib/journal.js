// @ts-check
/**
 * Change journal for incremental backups.
 *
 * SQLite triggers append every write to user data into `change_log` (one row per insert, update
 * or delete, with the row's full new state as JSON). The backup job appends new journal rows to
 * files on the host; a restore takes the newest base snapshot and replays the journal after it.
 *
 * The same per-table expressions build the triggers (migration `drizzle/0003_journal_triggers.sql`,
 * written by `node scripts/dev/journal-triggers.mjs`) and the base snapshot, so both always agree.
 * Rows that point at foods carry a `source:source_id` ref instead of a bare id, because food ids
 * differ between installations (the Swiss reference data is loaded separately).
 *
 * Plain JS so it runs in the slim runtime image (scripts/restore.js) as well as in the app.
 */

/** ref of the food with id `col` */
const ref = (/** @type {string} */ col) =>
	`(SELECT f.source || ':' || f.source_id FROM foods f WHERE f.id = ${col})`;

/**
 * Journaled tables. `R` stands for the row (`new`/`old` in triggers, the table alias in snapshots).
 * @type {Record<string, { key: string, json: string, when?: string }>}
 */
export const JOURNAL_TABLES = {
	foods: {
		key: 'R.id',
		when: "R.source <> 'swissfcd'",
		json: `json_object('id', R.id, 'ref', R.source || ':' || R.source_id, 'source', R.source,
			'source_id', R.source_id, 'name_de', R.name_de, 'name_en', R.name_en, 'synonyms', R.synonyms,
			'brand', R.brand, 'barcode', R.barcode, 'category', R.category, 'basis', R.basis,
			'density', R.density, 'nutrients', json(R.nutrients), 'partial', json(R.partial),
			'serving_size', R.serving_size, 'serving_quantity', R.serving_quantity,
			'deleted_at', R.deleted_at)`
	},
	food_portions: {
		key: 'R.id',
		json: `json_object('id', R.id, 'food', ${ref('R.food_id')}, 'label_de', R.label_de,
			'label_en', R.label_en, 'amount', R.amount, 'sort', R.sort)`
	},
	recipes: {
		key: 'R.food_id',
		json: `json_object('food', ${ref('R.food_id')}, 'servings', R.servings,
			'cooked_weight', R.cooked_weight, 'notes', R.notes)`
	},
	recipe_items: {
		key: 'R.id',
		json: `json_object('id', R.id, 'recipe', ${ref('R.recipe_id')}, 'food', ${ref('R.food_id')},
			'amount', R.amount, 'sort', R.sort)`
	},
	favorites: {
		key: 'R.food_id',
		json: `json_object('food', ${ref('R.food_id')}, 'created_at', R.created_at)`
	},
	log_entries: {
		key: 'R.id',
		json: `json_object('id', R.id, 'date', R.date, 'time', R.time, 'food', ${ref('R.food_id')},
			'food_name', R.food_name, 'food_brand', R.food_brand, 'basis', R.basis, 'amount', R.amount,
			'per100', json(R.per100), 'partial', json(R.partial), 'created_at', R.created_at)`
	},
	weights: {
		key: 'R.id',
		json: `json_object('id', R.id, 'date', R.date, 'kg', R.kg, 'note', R.note,
			'created_at', R.created_at)`
	},
	target_history: {
		key: 'R.effective_from',
		json: `json_object('effective_from', R.effective_from, 'targets', json(R.targets),
			'created_at', R.created_at)`
	},
	settings: {
		key: 'R.key',
		when: "R.key = 'user'",
		json: `json_object('value', json(R.value))`
	}
};

const as = (/** @type {string} */ sql, /** @type {string} */ row) =>
	sql.replaceAll('R.', `${row}.`);
const oneLine = (/** @type {string} */ s) => s.replace(/\s*\n\s*/g, ' ');

/** CREATE TRIGGER statements for every journaled table (insert, update, delete). */
export function triggerSql() {
	/** @type {string[]} */
	const out = [];
	for (const [tbl, d] of Object.entries(JOURNAL_TABLES)) {
		const at = "(unixepoch('subsec') * 1000)";
		for (const op of /** @type {const} */ (['insert', 'update', 'delete'])) {
			const row = op === 'delete' ? 'old' : 'new';
			const when = d.when ? ` WHEN ${as(d.when, row)}` : '';
			const data = op === 'delete' ? 'NULL' : oneLine(as(d.json, 'new'));
			out.push(
				`CREATE TRIGGER \`journal_${tbl}_${op[0]}\` AFTER ${op.toUpperCase()} ON \`${tbl}\`${when} BEGIN\n` +
					`\tINSERT INTO change_log (at, tbl, op, row_key, data) VALUES (CAST(${at} AS INTEGER), '${tbl}', '${op[0]}', ${as(d.key, row)}, ${data});\n` +
					`END;`
			);
		}
	}
	return out;
}

/**
 * @typedef {Record<string, Record<string, any>>} State  table → row key → row data
 * @typedef {{ format: 1, seq: number, createdAt: string, tables: State }} BaseSnapshot
 * @typedef {{ seq: number, at: number, tbl: string, op: 'i' | 'u' | 'd', key: string, data: any }} JournalLine
 */

/**
 * Snapshot of all journaled rows plus the journal position it corresponds to. Run it inside one
 * read transaction so the rows and `seq` are consistent.
 * @param {import('better-sqlite3').Database} client
 * @returns {BaseSnapshot}
 */
export function baseSnapshot(client) {
	const read = client.transaction(() => {
		const seq = /** @type {{ s: number | null }} */ (
			client.prepare('SELECT MAX(seq) AS s FROM change_log').get()
		).s;
		const last = /** @type {{ seq: number } | undefined} */ (
			client.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'change_log'").get()
		);
		/** @type {State} */
		const tables = {};
		for (const [tbl, d] of Object.entries(JOURNAL_TABLES)) {
			const where = d.when ? ` WHERE ${as(d.when, 'R')}` : '';
			const rows = /** @type {{ k: string | number, d: string }[]} */ (
				client.prepare(`SELECT ${d.key} AS k, ${d.json} AS d FROM \`${tbl}\` AS R${where}`).all()
			);
			tables[tbl] = Object.fromEntries(rows.map((r) => [String(r.k), JSON.parse(r.d)]));
		}
		return {
			format: /** @type {const} */ (1),
			seq: seq ?? last?.seq ?? 0,
			createdAt: new Date().toISOString(),
			tables
		};
	});
	return read.deferred();
}

/**
 * Journal rows after `afterSeq`, oldest first.
 * @param {import('better-sqlite3').Database} client
 * @param {number} afterSeq
 * @returns {JournalLine[]}
 */
export function journalSince(client, afterSeq) {
	const rows =
		/** @type {{ seq: number, at: number, tbl: string, op: 'i' | 'u' | 'd', row_key: string | number, data: string | null }[]} */ (
			client
				.prepare(
					'SELECT seq, at, tbl, op, row_key, data FROM change_log WHERE seq > ? ORDER BY seq'
				)
				.all(afterSeq)
		);
	return rows.map((r) => ({
		seq: r.seq,
		at: r.at,
		tbl: r.tbl,
		op: r.op,
		key: String(r.row_key),
		data: r.data === null ? null : JSON.parse(r.data)
	}));
}

/**
 * Apply journal lines (with seq > base.seq) to a copy of the base state. Lines may repeat
 * (a crash between appending and recording the position): replay is idempotent.
 * @param {BaseSnapshot} base
 * @param {Iterable<JournalLine>} lines
 * @returns {State}
 */
export function replay(base, lines) {
	/** @type {State} */
	const state = structuredClone(base.tables);
	let seq = base.seq;
	const sorted = [...lines].sort((a, b) => a.seq - b.seq);
	for (const l of sorted) {
		if (l.seq <= seq) continue;
		seq = l.seq;
		const t = (state[l.tbl] ??= {});
		if (l.op === 'd') delete t[l.key];
		else t[l.key] = l.data;
	}
	return state;
}

/**
 * Turn a replayed state into a regular backup file (`src/lib/server/backup.ts`, version 2), which
 * the app's import can load into any installation.
 * @param {State} s
 */
export function stateToBackup(s) {
	const rows = (/** @type {string} */ t) => Object.values(s[t] ?? {});
	const foods = rows('foods');
	const known = new Set(foods.map((f) => f.ref));
	/** @type {any[]} */
	const stubs = [];
	const need = (/** @type {string | null} */ r) => {
		if (!r || known.has(r)) return;
		known.add(r);
		const i = r.indexOf(':');
		// Swiss reference foods are matched by id on import; their data comes from the dataset
		stubs.push({
			ref: r,
			source: r.slice(0, i),
			sourceId: r.slice(i + 1),
			nameDe: null,
			nameEn: null,
			synonyms: null,
			brand: null,
			barcode: null,
			category: null,
			basis: 'g',
			density: null,
			nutrients: {},
			partial: null,
			servingSize: null,
			servingQuantity: null,
			deletedAt: null
		});
	};
	for (const e of rows('log_entries')) need(e.food);
	for (const p of rows('food_portions')) need(p.food);
	for (const i of rows('recipe_items')) need(i.food);
	for (const f of rows('favorites')) need(f.food);
	const items = rows('recipe_items');
	return {
		app: 'nutrition',
		version: 2,
		exportedAt: new Date().toISOString(),
		settings: s.settings?.user?.value ?? {},
		foods: [
			...foods.map((f) => ({
				ref: f.ref,
				source: f.source,
				sourceId: f.source_id,
				nameDe: f.name_de,
				nameEn: f.name_en,
				synonyms: f.synonyms,
				brand: f.brand,
				barcode: f.barcode,
				category: f.category,
				basis: f.basis,
				density: f.density,
				nutrients: f.nutrients ?? {},
				partial: f.partial,
				servingSize: f.serving_size,
				servingQuantity: f.serving_quantity,
				deletedAt: f.deleted_at
			})),
			...stubs
		],
		portions: rows('food_portions')
			.filter((p) => p.food)
			.map((p) => ({
				food: p.food,
				labelDe: p.label_de,
				labelEn: p.label_en,
				amount: p.amount,
				sort: p.sort
			})),
		recipes: rows('recipes')
			.filter((r) => r.food)
			.map((r) => ({
				food: r.food,
				servings: r.servings,
				cookedWeight: r.cooked_weight,
				notes: r.notes,
				items: items
					.filter((i) => i.recipe === r.food && i.food)
					.sort((a, b) => a.sort - b.sort || a.id - b.id)
					.map((i) => ({ food: i.food, amount: i.amount, sort: i.sort }))
			})),
		favorites: rows('favorites')
			.map((f) => f.food)
			.filter(Boolean),
		entries: rows('log_entries')
			.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id - b.id)
			.map((e) => ({
				date: e.date,
				time: e.time,
				food: e.food,
				foodName: e.food_name,
				foodBrand: e.food_brand,
				basis: e.basis,
				amount: e.amount,
				per100: e.per100 ?? {},
				partial: e.partial,
				createdAt: e.created_at
			})),
		weights: rows('weights')
			.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
			.map((w) => ({ date: w.date, kg: w.kg, note: w.note, createdAt: w.created_at })),
		targetHistory: rows('target_history')
			.sort((a, b) => a.effective_from.localeCompare(b.effective_from))
			.map((t) => ({
				effectiveFrom: t.effective_from,
				targets: t.targets,
				createdAt: t.created_at
			}))
	};
}
