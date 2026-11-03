/** Minimal typed i18n: `t('day.remaining')`, number/date formatting with Swiss conventions. */
import { de, type Messages } from './de';
import { en } from './en';
import type { Lang } from '../types';

const catalogs: Record<Lang, Messages> = { de, en };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = { [K in keyof T]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T];
export type MessageKey = Paths<Messages>;

export const i18n = $state<{ lang: Lang }>({ lang: 'de' });

export function setLang(l: Lang) {
	i18n.lang = l;
	if (typeof document !== 'undefined') document.documentElement.lang = l === 'de' ? 'de-CH' : 'en';
}

export function translate(
	lang: Lang,
	key: MessageKey,
	params?: Record<string, string | number>
): string {
	let node: unknown = catalogs[lang];
	for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part];
	let s = typeof node === 'string' ? node : key;
	if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
	return s;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
	return translate(i18n.lang, key, params);
}

export function locale(lang: Lang = i18n.lang): string {
	return lang === 'de' ? 'de-CH' : 'en-CH';
}

const nfCache = new Map<string, Intl.NumberFormat>();
export function fmt(n: number | null | undefined, decimals = 0, lang: Lang = i18n.lang): string {
	if (n === null || n === undefined || !Number.isFinite(n)) return '–';
	const key = `${lang}:${decimals}`;
	let nf = nfCache.get(key);
	if (!nf) {
		nf = new Intl.NumberFormat(locale(lang), {
			maximumFractionDigits: decimals,
			minimumFractionDigits: 0
		});
		nfCache.set(key, nf);
	}
	return nf.format(n);
}

/** Smart decimals for nutrient amounts: 0 for ≥100, 1 for ≥10 (or g), 2 below. */
export function fmtAmount(n: number | null | undefined, lang: Lang = i18n.lang): string {
	if (n === null || n === undefined) return '–';
	const a = Math.abs(n);
	return fmt(n, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2, lang);
}

export function fmtDate(
	date: string,
	opts: Intl.DateTimeFormatOptions,
	lang: Lang = i18n.lang
): string {
	return new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', ...opts }).format(
		new Date(date + 'T00:00:00Z')
	);
}

export { de, en };
