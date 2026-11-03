/** Lazy, tree-shaken Chart.js setup (only the pieces we use). */
import type { Chart as ChartType } from 'chart.js';

let loaded: Promise<typeof ChartType> | null = null;

export function loadChart(): Promise<typeof ChartType> {
	if (!loaded) {
		loaded = import('chart.js').then((m) => {
			m.Chart.register(
				m.BarController,
				m.BarElement,
				m.LineController,
				m.LineElement,
				m.PointElement,
				m.CategoryScale,
				m.LinearScale,
				m.Tooltip,
				m.Filler
			);
			return m.Chart;
		});
	}
	return loaded;
}

export function cssVar(name: string, fallback = '#888'): string {
	if (typeof document === 'undefined') return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
