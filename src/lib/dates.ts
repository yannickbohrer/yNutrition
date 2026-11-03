/** Local-date helpers. Dates are 'YYYY-MM-DD' strings in the app time zone (Europe/Zurich). */

export const APP_TZ = 'Europe/Zurich';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(s: unknown): s is string {
	if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
	const d = new Date(s + 'T00:00:00Z');
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isTime(s: unknown): s is string {
	return typeof s === 'string' && TIME_RE.test(s);
}

function parts(d: Date, tz: string) {
	const f = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
	return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function todayLocal(tz = APP_TZ, now = new Date()): string {
	return parts(now, tz).date;
}

export function nowTimeLocal(tz = APP_TZ, now = new Date()): string {
	return parts(now, tz).time;
}

export function addDays(date: string, n: number): string {
	const d = new Date(date + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
	return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: string): string {
	const d = new Date(date + 'T00:00:00Z');
	const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
	return addDays(date, -dow);
}

export function startOfMonth(date: string): string {
	return date.slice(0, 8) + '01';
}

export function endOfMonth(date: string): string {
	const d = new Date(date.slice(0, 8) + '01T00:00:00Z');
	d.setUTCMonth(d.getUTCMonth() + 1);
	d.setUTCDate(0);
	return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number): string {
	const d = new Date(date.slice(0, 8) + '01T00:00:00Z');
	d.setUTCMonth(d.getUTCMonth() + n);
	return d.toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
	return out;
}
