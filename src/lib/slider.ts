/** Pure helpers for the portion slider (range, magnetic snapping, rounding). */

export interface SnapPoint {
	amount: number;
	label: string;
}

/** Slider range: 0 … max(300, 3 × largest preset), rounded up to a "nice" number, ≥ 1.25 × value. */
export function sliderMax(presets: number[], value: number, extended = 0): number {
	const largest = presets.length ? Math.max(...presets) : 100;
	let max = Math.max(300, largest * 3, value * 1.25);
	max *= 2 ** extended;
	const nice = max <= 500 ? 50 : max <= 2000 ? 100 : 500;
	return Math.ceil(max / nice) * nice;
}

/** Step for free (non-snapped) values: finer for small ranges. */
export function freeStep(max: number): number {
	if (max <= 400) return 1;
	if (max <= 1500) return 5;
	return 10;
}

export function roundTo(v: number, step: number): number {
	return Math.round(v / step) * step;
}

/**
 * Magnetic snapping: if `raw` is within `radiusPx` of a snap point (given the track scale in
 * px per unit), return that point; otherwise round to the free step.
 */
export function snapValue(
	raw: number,
	points: number[],
	pxPerUnit: number,
	step: number,
	radiusPx = 14
): { value: number; snapped: number | null } {
	const radius = radiusPx / Math.max(pxPerUnit, 1e-6);
	let best: number | null = null;
	let bestDist = Infinity;
	for (const p of points) {
		const d = Math.abs(p - raw);
		if (d <= radius && d < bestDist) {
			best = p;
			bestDist = d;
		}
	}
	if (best !== null) return { value: best, snapped: best };
	return { value: Math.max(0, roundTo(raw, step)), snapped: null };
}

/** Clamp and round a manually entered amount. */
export function parseAmount(input: string): number | null {
	const s = input
		.trim()
		.replace(/[’'\s]/g, '')
		.replace(',', '.');
	if (!s) return null;
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.min(20000, Math.round(n * 10) / 10);
}

/** Step size for +/- buttons with long-press acceleration (repeat count → multiplier). */
export function accelerate(baseStep: number, repeats: number): number {
	if (repeats < 6) return baseStep;
	if (repeats < 16) return baseStep * 2;
	return baseStep * 5;
}

/** Hide tick labels that would overlap: keep labels at least `minPx` apart (priority to default). */
export function visibleTickLabels(
	points: { amount: number; important?: boolean }[],
	pxPerUnit: number,
	minPx = 44
): Set<number> {
	const sorted = [...points].sort(
		(a, b) => Number(!!b.important) - Number(!!a.important) || a.amount - b.amount
	);
	const shown: number[] = [];
	for (const p of sorted) {
		if (shown.every((s) => Math.abs(s - p.amount) * pxPerUnit >= minPx)) shown.push(p.amount);
	}
	return new Set(shown);
}
