<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ChartConfiguration, Chart } from 'chart.js';
	import { loadChart } from '#lib/charts.ts';

	let {
		config,
		label,
		height = 220
	}: { config: () => ChartConfiguration; label: string; height?: number } = $props();
	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | null = null;

	$effect(() => {
		const cfg = config();
		if (!canvas) return;
		let cancelled = false;
		loadChart().then((C) => {
			if (cancelled || !canvas) return;
			if (chart) {
				chart.data = cfg.data;
				chart.options = cfg.options ?? {};
				chart.update();
			} else chart = new C(canvas, cfg);
		});
		return () => {
			cancelled = true;
		};
	});

	// re-render on light/dark switch
	$effect(() => {
		const mq = matchMedia('(prefers-color-scheme: dark)');
		const fn = () => {
			chart?.destroy();
			chart = null;
			const cfg = config();
			loadChart().then((C) => canvas && (chart = new C(canvas, cfg)));
		};
		mq.addEventListener('change', fn);
		return () => mq.removeEventListener('change', fn);
	});

	onDestroy(() => chart?.destroy());
</script>

<div class="chart" style:height="{height}px">
	<canvas bind:this={canvas} aria-label={label}></canvas>
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
	}
</style>
