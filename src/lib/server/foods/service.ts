/** Orchestrates local + remote food lookups with caching. */
import { desc, eq, isNull } from 'drizzle-orm';
import { config } from '../config';
import { getDb, type DB } from '../db';
import { barcodeMisses, favorites, foods, searchCache } from '../db/schema';
import type {
	BarcodeResult,
	FoodSourceId,
	FoodSummary,
	Lang,
	OnlineSearchResult,
	SearchSections
} from '../../types';
import { OpenFoodFactsSource } from './off';
import { UsdaSource } from './usda';
import {
	favoriteIds,
	findByBarcode,
	getFoodDTO,
	recentFoods,
	summariesByIds,
	toSummary,
	upsertNormalized,
	usageCounts
} from './repo';
import { localSearch, normalizeText } from './search';
import { RateLimitedError, type FoodSource, type NormalizedFood } from './types';

export interface Sources {
	off: FoodSource;
	usda: FoodSource;
}

let sources: Sources | undefined;

export function getSources(): Sources {
	if (!sources) {
		if (!config.offContactEmail) {
			console.warn(
				'[nutrition] OFF_CONTACT_EMAIL is not set — Open Food Facts asks for a contact in the User-Agent.'
			);
		}
		sources = {
			off: new OpenFoodFactsSource({
				baseUrl: config.offBaseUrl,
				searchUrl: config.offSearchUrl,
				userAgent: config.userAgent,
				enabled: config.offEnabled
			}),
			usda: new UsdaSource({ apiKey: config.usdaApiKey, baseUrl: config.usdaBaseUrl })
		};
	}
	return sources;
}

/** For tests. */
export function setSources(s: Sources | undefined) {
	sources = s;
}

const SEARCH_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 24 * 3600_000;

export function searchLocal(query: string, lang: Lang, db: DB = getDb()): SearchSections {
	const favs = favoriteIds(db);
	const usage = usageCounts(db);
	const rows = localSearch(db, query, { favorites: favs, usage, lang }, 50);
	const mine: FoodSummary[] = [];
	const local: FoodSummary[] = [];
	for (const r of rows) {
		const s = toSummary(r, lang, favs);
		if (favs.has(r.id) || usage.has(r.id)) mine.push(s);
		else local.push(s);
	}
	return { query, mine: mine.slice(0, 10), local: local.slice(0, 40) };
}

export function suggestions(lang: Lang, db: DB = getDb()) {
	const favRows = db
		.select({ f: foods })
		.from(favorites)
		.innerJoin(foods, eq(foods.id, favorites.foodId))
		.where(isNull(foods.deletedAt))
		.orderBy(desc(favorites.createdAt))
		.all();
	const favs = favoriteIds(db);
	const recents = recentFoods(30, db);
	const frequent = [...recents].sort((a, b) => b.uses - a.uses).slice(0, 10);
	return {
		favorites: favRows.map((r) => toSummary(r.f, lang, favs)),
		recent: summariesByIds(
			recents.slice(0, 20).map((r) => r.foodId),
			lang,
			db
		),
		frequent: summariesByIds(
			frequent.filter((r) => r.uses > 1).map((r) => r.foodId),
			lang,
			db
		)
	};
}

export async function searchOnline(
	query: string,
	lang: Lang,
	db: DB = getDb(),
	src: Sources = getSources()
): Promise<OnlineSearchResult> {
	const q = query.trim();
	const active = [src.off, src.usda].filter((s) => s.enabled() && s.search);
	const sourceIds = active.map((s) => s.id) as FoodSourceId[];
	if (q.length < 2 || !active.length)
		return { query: q, results: [], sources: sourceIds, cached: false };

	const key = `${lang}:${normalizeText(q).replace(/\s+/g, ' ')}`;
	const cached = db.select().from(searchCache).where(eq(searchCache.key, key)).get();
	if (cached && Date.now() - cached.fetchedAt < SEARCH_TTL) {
		return {
			query: q,
			results: summariesByIds(cached.foodIds, lang, db),
			sources: sourceIds,
			cached: true
		};
	}

	let limited = false;
	const errors: string[] = [];
	const settled = await Promise.allSettled(active.map((s) => s.search!(q, { lang, limit: 20 })));
	const found: NormalizedFood[] = [];
	settled.forEach((r, i) => {
		if (r.status === 'fulfilled') found.push(...r.value);
		else if (r.reason instanceof RateLimitedError) limited = true;
		else errors.push(`${active[i].id}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
	});
	const ids = db.transaction((tx) => found.map((f) => upsertNormalized(f, tx as unknown as DB)));
	const unique = [...new Set(ids)];
	if (!limited && !errors.length) {
		db.insert(searchCache)
			.values({ key, foodIds: unique, fetchedAt: Date.now() })
			.onConflictDoUpdate({
				target: searchCache.key,
				set: { foodIds: unique, fetchedAt: Date.now() }
			})
			.run();
	}
	if (errors.length) console.warn('[nutrition] online search errors:', errors.join('; '));
	return {
		query: q,
		results: summariesByIds(unique, lang, db),
		sources: sourceIds,
		cached: false,
		limited: limited || undefined,
		error: errors.length && !unique.length ? 'unavailable' : undefined
	};
}

export function isValidBarcode(code: string): boolean {
	return /^\d{8}$|^\d{12,14}$/.test(code);
}

export async function lookupBarcode(
	barcode: string,
	lang: Lang,
	db: DB = getDb(),
	src: Sources = getSources()
): Promise<BarcodeResult> {
	const code = barcode.replace(/\D/g, '');
	const local = findByBarcode(code, db);
	if (local) return { barcode: code, food: getFoodDTO(local.id, lang, db) };
	if (!src.off.enabled() || !src.off.lookupBarcode) return { barcode: code, food: null };
	const miss = db.select().from(barcodeMisses).where(eq(barcodeMisses.barcode, code)).get();
	if (miss && Date.now() - miss.checkedAt < MISS_TTL) return { barcode: code, food: null };
	try {
		const n = await src.off.lookupBarcode(code);
		if (!n) {
			db.insert(barcodeMisses)
				.values({ barcode: code, checkedAt: Date.now() })
				.onConflictDoUpdate({ target: barcodeMisses.barcode, set: { checkedAt: Date.now() } })
				.run();
			return { barcode: code, food: null };
		}
		const id = upsertNormalized({ ...n, barcode: n.barcode ?? code }, db);
		return { barcode: code, food: getFoodDTO(id, lang, db) };
	} catch (e) {
		if (e instanceof RateLimitedError) return { barcode: code, food: null, limited: true };
		console.warn('[nutrition] barcode lookup failed:', e);
		return { barcode: code, food: null, error: 'unavailable' };
	}
}
