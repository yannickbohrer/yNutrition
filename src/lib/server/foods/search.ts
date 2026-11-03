/**
 * Local food search over SQLite FTS5.
 *  - foods_fts (unicode61, remove_diacritics): word-prefix matching, "apf" → "Apfel", "Äpfel"
 *  - foods_tri (trigram): substring matching for German compounds, "brot" → "Vollkornbrot"
 * Candidates are re-ranked in JS (exact first word, prefix, favorites, usage, source).
 */
import type { DB } from '../db';
import type { FoodRow } from '../db/schema';

/** lower-case, strip diacritics, keep letters/digits */
export function normalizeText(s: string): string {
	return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase();
}

export function tokenize(q: string): string[] {
	return normalizeText(q)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.slice(0, 8);
}

/** Swiss/German keyboards: "ue" may be typed for "ü" → after diacritic removal "u". */
function umlautVariant(t: string): string | null {
	const v = t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
	return v !== t ? v : null;
}

const quote = (t: string) => `"${t.replace(/"/g, '')}"`;

export function buildFtsQuery(tokens: string[]): string | null {
	if (!tokens.length) return null;
	return tokens
		.map((t) => {
			const v = umlautVariant(t);
			return v ? `(${quote(t)}* OR ${quote(v)}*)` : `${quote(t)}*`;
		})
		.join(' AND ');
}

export function buildTrigramQuery(tokens: string[]): string | null {
	const long = tokens.filter((t) => t.length >= 3);
	if (!long.length || long.length !== tokens.length) return null;
	return long.map(quote).join(' AND ');
}

export interface RankContext {
	favorites: Set<number>;
	usage: Map<number, number>;
	lang: 'de' | 'en';
}

const SOURCE_BONUS: Record<string, number> = {
	custom: 14,
	recipe: 14,
	swissfcd: 10,
	off: 4,
	usda: 0
};

export function scoreFood(
	f: FoodRow,
	query: string,
	ctx: RankContext,
	viaTrigramOnly: boolean
): number {
	const q = normalizeText(query.trim());
	const name = normalizeText(
		(ctx.lang === 'en' ? (f.nameEn ?? f.nameDe) : (f.nameDe ?? f.nameEn)) ?? ''
	);
	const other = normalizeText((ctx.lang === 'en' ? f.nameDe : f.nameEn) ?? '');
	const brand = normalizeText(f.brand ?? '');
	let s = 0;
	const firstWord = name.split(/[^\p{L}\p{N}]+/u)[0] ?? '';
	if (name === q) s += 120;
	if (firstWord === q) s += 60;
	if (name.startsWith(q)) s += 50;
	else if (new RegExp(`(^|[^\\p{L}])${escapeRe(q)}`, 'u').test(name)) s += 30;
	else if (name.includes(q)) s += 15;
	else if (other.includes(q) || brand.includes(q)) s += 8;
	if (f.synonyms) {
		const syn = normalizeText(f.synonyms).split(/\s*[;,]\s*/);
		if (syn.includes(q)) s += 75;
		else if (syn.some((x) => x.startsWith(q))) s += 20;
	}
	if (viaTrigramOnly) s -= 5;
	// prefer raw/plain variants for generic foods
	if (/, (roh|raw)\b/.test(name)) s += 6;
	s += SOURCE_BONUS[f.source] ?? 0;
	if (ctx.favorites.has(f.id)) s += 40;
	const uses = ctx.usage.get(f.id) ?? 0;
	if (uses) s += Math.min(40, 12 * Math.log2(1 + uses));
	s -= Math.min(20, name.length / 6);
	if (!f.nutrients || f.nutrients.energy_kcal === undefined) s -= 10;
	return s;
}

function escapeRe(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function localSearch(db: DB, query: string, ctx: RankContext, limit = 40): FoodRow[] {
	const tokens = tokenize(query);
	const fts = buildFtsQuery(tokens);
	if (!fts) return [];
	const client = db.$client;
	const ids = new Map<number, boolean>(); // id → found via word index
	try {
		for (const r of client
			.prepare(`select rowid as id from foods_fts where foods_fts match ? limit 300`)
			.all(fts) as { id: number }[])
			ids.set(r.id, true);
	} catch {
		/* malformed query — ignore */
	}
	const tri = buildTrigramQuery(tokens);
	if (tri) {
		try {
			for (const r of client
				.prepare(`select rowid as id from foods_tri where foods_tri match ? limit 300`)
				.all(tri) as { id: number }[])
				if (!ids.has(r.id)) ids.set(r.id, false);
		} catch {
			/* ignore */
		}
	}
	if (!ids.size) return [];
	const idList = [...ids.keys()];
	const rows: FoodRow[] = [];
	// chunk to stay below SQLite variable limits
	for (let i = 0; i < idList.length; i += 500) {
		const chunk = idList.slice(i, i + 500);
		const stmt = client.prepare(
			`select * from foods where deleted_at is null and id in (${chunk.map(() => '?').join(',')})`
		);
		for (const r of stmt.all(...chunk) as Record<string, unknown>[]) rows.push(mapRow(r));
	}
	return rows
		.map((f) => ({ f, s: scoreFood(f, query, ctx, !ids.get(f.id)) }))
		.sort((a, b) => b.s - a.s)
		.slice(0, limit)
		.map((x) => x.f);
}

/** Map a raw sqlite row (snake_case, JSON text) to the drizzle FoodRow shape. */
export function mapRow(r: Record<string, unknown>): FoodRow {
	const json = <T>(v: unknown): T | null => (typeof v === 'string' ? (JSON.parse(v) as T) : null);
	return {
		id: r.id as number,
		source: r.source as FoodRow['source'],
		sourceId: r.source_id as string,
		nameDe: r.name_de as string | null,
		nameEn: r.name_en as string | null,
		synonyms: r.synonyms as string | null,
		brand: r.brand as string | null,
		barcode: r.barcode as string | null,
		category: r.category as string | null,
		basis: r.basis as FoodRow['basis'],
		density: r.density as number | null,
		nutrients: json(r.nutrients) ?? {},
		partial: json(r.partial),
		servingSize: r.serving_size as string | null,
		servingQuantity: r.serving_quantity as number | null,
		imageUrl: r.image_url as string | null,
		createdAt: r.created_at as number,
		updatedAt: r.updated_at as number,
		fetchedAt: r.fetched_at as number | null,
		deletedAt: r.deleted_at as number | null
	};
}
