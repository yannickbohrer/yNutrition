import { sql } from 'drizzle-orm';
import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { NutrientKey, Nutrients } from '../../nutrients';

const now = sql`(unixepoch() * 1000)`;

// ---------- auth ----------
export const credentials = sqliteTable('credentials', {
	id: text('id').primaryKey(), // base64url credential id
	publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
	counter: integer('counter').notNull().default(0),
	transports: text('transports', { mode: 'json' }).$type<string[]>(),
	name: text('name').notNull(),
	deviceType: text('device_type'),
	backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at').notNull().default(now),
	lastUsedAt: integer('last_used_at')
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(), // HMAC of the cookie token
	createdAt: integer('created_at').notNull().default(now),
	expiresAt: integer('expires_at').notNull(),
	userAgent: text('user_agent')
});

export const setupTokens = sqliteTable('setup_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	purpose: text('purpose', { enum: ['initial', 'recovery'] }).notNull(),
	createdAt: integer('created_at').notNull().default(now),
	expiresAt: integer('expires_at'),
	usedAt: integer('used_at')
});

// ---------- settings (single user, key/value) ----------
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull()
});

// ---------- foods ----------
export type FoodSourceId = 'swissfcd' | 'off' | 'usda' | 'custom' | 'recipe';

export const foods = sqliteTable(
	'foods',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		source: text('source').$type<FoodSourceId>().notNull(),
		sourceId: text('source_id').notNull(),
		nameDe: text('name_de'),
		nameEn: text('name_en'),
		synonyms: text('synonyms'),
		brand: text('brand'),
		barcode: text('barcode'),
		category: text('category'),
		basis: text('basis', { enum: ['g', 'ml'] })
			.notNull()
			.default('g'),
		density: real('density'),
		nutrients: text('nutrients', { mode: 'json' }).$type<Nutrients>().notNull(),
		/** keys known only partially (e.g. recipes whose ingredients lack data) */
		partial: text('partial', { mode: 'json' }).$type<NutrientKey[]>(),
		servingSize: text('serving_size'),
		servingQuantity: real('serving_quantity'),
		imageUrl: text('image_url'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now),
		fetchedAt: integer('fetched_at'),
		deletedAt: integer('deleted_at')
	},
	(t) => [
		uniqueIndex('foods_source_uq').on(t.source, t.sourceId),
		index('foods_barcode_idx').on(t.barcode)
	]
);

export const foodPortions = sqliteTable(
	'food_portions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		foodId: integer('food_id')
			.notNull()
			.references(() => foods.id, { onDelete: 'cascade' }),
		labelDe: text('label_de').notNull(),
		labelEn: text('label_en'),
		amount: real('amount').notNull(),
		sort: integer('sort').notNull().default(0)
	},
	(t) => [index('food_portions_food_idx').on(t.foodId)]
);

export const recipes = sqliteTable('recipes', {
	foodId: integer('food_id')
		.primaryKey()
		.references(() => foods.id, { onDelete: 'cascade' }),
	servings: real('servings').notNull().default(1),
	cookedWeight: real('cooked_weight'),
	notes: text('notes')
});

export const recipeItems = sqliteTable(
	'recipe_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.foodId, { onDelete: 'cascade' }),
		foodId: integer('food_id')
			.notNull()
			.references(() => foods.id),
		amount: real('amount').notNull(),
		sort: integer('sort').notNull().default(0)
	},
	(t) => [index('recipe_items_recipe_idx').on(t.recipeId)]
);

export const favorites = sqliteTable('favorites', {
	foodId: integer('food_id')
		.primaryKey()
		.references(() => foods.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull().default(now)
});

// ---------- log ----------
export const logEntries = sqliteTable(
	'log_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** local date YYYY-MM-DD (Europe/Zurich) */
		date: text('date').notNull(),
		/** local time HH:MM */
		time: text('time').notNull(),
		foodId: integer('food_id').references(() => foods.id, { onDelete: 'set null' }),
		/** snapshot of the food at logging time, so history stays stable */
		foodName: text('food_name').notNull(),
		foodBrand: text('food_brand'),
		basis: text('basis', { enum: ['g', 'ml'] })
			.notNull()
			.default('g'),
		amount: real('amount').notNull(),
		per100: text('per100', { mode: 'json' }).$type<Nutrients>().notNull(),
		partial: text('partial', { mode: 'json' }).$type<NutrientKey[]>(),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('log_entries_date_idx').on(t.date), index('log_entries_food_idx').on(t.foodId)]
);

// ---------- body weight ----------
export const weights = sqliteTable(
	'weights',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		date: text('date').notNull(),
		kg: real('kg').notNull(),
		note: text('note'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('weights_date_idx').on(t.date)]
);

// ---------- caches ----------
export const searchCache = sqliteTable('search_cache', {
	key: text('key').primaryKey(),
	foodIds: text('food_ids', { mode: 'json' }).$type<number[]>().notNull(),
	fetchedAt: integer('fetched_at').notNull()
});

export const barcodeMisses = sqliteTable('barcode_misses', {
	barcode: text('barcode').primaryKey(),
	checkedAt: integer('checked_at').notNull()
});

export type FoodRow = typeof foods.$inferSelect;
export type NewFoodRow = typeof foods.$inferInsert;
export type LogEntryRow = typeof logEntries.$inferSelect;
export type CredentialRow = typeof credentials.$inferSelect;
