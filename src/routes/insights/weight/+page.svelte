<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import BackNav from '#lib/components/BackNav.svelte';
	import ChartCanvas from '#lib/components/ChartCanvas.svelte';
	import { viewport } from '#lib/stores/viewport.svelte.ts';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { cssVar } from '#lib/charts.ts';
	import { movingAverage } from '#lib/nutrition.ts';
	import { addDays, diffDays, startOfWeek } from '#lib/dates.ts';
	import { fmt, fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import type { WeightDTO } from '#lib/types.ts';
	import type { WeightCursor } from '#lib/server/weights.ts';

	type Range = 'd30' | 'd90' | 'y1' | 'all';
	const RANGES: Range[] = ['d30', 'd90', 'y1', 'all'];
	const RANGE_DAYS = { d30: 30, d90: 90, y1: 365 } as const;
	const RANGE_KEY = 'weight.range';

	// history list: newest first, loaded page by page so every weigh-in stays reachable
	let list = $state<WeightDTO[]>([]);
	let next = $state<WeightCursor | null>(null);
	let total = $state(0);
	let first = $state<WeightDTO | null>(null);
	let latest = $state<WeightDTO | null>(null);
	let loaded = $state(false);
	let loadingMore = $state(false);
	/** how many rows the list was expanded to; a refresh keeps that many */
	let shown = 50;

	// chart: every weigh-in in the selected range
	let range = $state<Range>('d90');
	let points = $state<WeightDTO[]>([]);

	let kg = $state<number | null>(null);
	let date = $state(app.today);
	let note = $state('');
	let busy = $state(false);

	const rangeFrom = $derived(
		range === 'all' ? (first?.date ?? app.today) : addDays(app.today, -(RANGE_DAYS[range] - 1))
	);
	const rangeTo = $derived(latest && latest.date > app.today ? latest.date : app.today);

	onMount(() => {
		try {
			const r = localStorage.getItem(RANGE_KEY) as Range | null;
			if (r && RANGES.includes(r)) range = r;
		} catch {
			// storage blocked: keep the default range
		}
		reloadList();
	});
	function setRange(r: Range) {
		range = r;
		try {
			localStorage.setItem(RANGE_KEY, r);
		} catch {
			// not persisted
		}
	}

	async function reloadList() {
		// keep the list as far expanded as before (a refresh shouldn't collapse it)
		let p = await api.weightsPage(null, Math.min(200, shown));
		const items = [...p.items];
		while (p.next && items.length < shown) {
			p = await api.weightsPage(p.next, Math.min(200, shown - items.length));
			items.push(...p.items);
		}
		list = items;
		next = p.next;
		total = p.total;
		first = p.first;
		latest = p.latest;
		loaded = true;
		if (kg === null && latest) kg = latest.kg;
	}
	async function loadMore() {
		if (!next || loadingMore) return;
		loadingMore = true;
		try {
			const p = await api.weightsPage(next, 50);
			list = [...list, ...p.items];
			shown = list.length;
			next = p.next;
			total = p.total;
		} finally {
			loadingMore = false;
		}
	}

	let chartReq = 0;
	function loadPoints() {
		if (!loaded) return;
		const id = ++chartReq;
		api.weightsBetween(rangeFrom, rangeTo).then((ws) => {
			if (id === chartReq) points = ws;
		});
	}
	$effect(() => {
		// re-run on range change and whenever the list was reloaded
		void [rangeFrom, rangeTo, total, loaded];
		loadPoints();
	});

	async function add(e: Event) {
		e.preventDefault();
		if (!kg) return;
		busy = true;
		try {
			await api.addWeight({ date, kg: Number(kg), note: note || undefined });
			note = '';
			toast(t('weight.saved'));
			await reloadList();
		} finally {
			busy = false;
		}
	}

	async function remove(w: WeightDTO) {
		list = list.filter((x) => x.id !== w.id);
		try {
			const { row } = await api.deleteWeight(w.id);
			await reloadList();
			toast(t('weight.deleted', { d: fmtDate(w.date, { day: 'numeric', month: 'short' }) }), {
				action: {
					label: t('app.undo'),
					run: async () => {
						await api.restoreWeight(row);
						await reloadList();
					}
				}
			});
		} catch {
			await reloadList();
		}
	}

	// more than a year: weekly averages keep the chart readable
	const weekly = $derived(diffDays(rangeFrom, rangeTo) > 366);
	const series = $derived.by(() => {
		if (!weekly) return points.map((w) => ({ date: w.date, value: w.kg }));
		// plain object: a derived value, never mutated after it's built
		const byWeek: Record<string, number[]> = {};
		for (const w of points) (byWeek[startOfWeek(w.date)] ??= []).push(w.kg);
		return Object.entries(byWeek).map(([d, v]) => ({
			date: d,
			value: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100
		}));
	});
	const trend = $derived(movingAverage(series, weekly ? 28 : 7));
	const change = $derived(points.length > 1 ? points[points.length - 1].kg - points[0].kg : null);

	function chartConfig(): ChartConfiguration {
		const multiYear = rangeFrom.slice(0, 4) !== rangeTo.slice(0, 4);
		return {
			type: 'line',
			data: {
				labels: series.map((w) =>
					fmtDate(
						w.date,
						multiYear
							? { day: 'numeric', month: 'numeric', year: '2-digit' }
							: { day: 'numeric', month: 'numeric' }
					)
				),
				datasets: [
					{
						label: t('weight.kg'),
						data: series.map((w) => w.value),
						borderColor: 'transparent',
						backgroundColor: cssVar('--label-3'),
						pointRadius: series.length > 120 ? 2 : 3,
						showLine: false
					},
					{
						label: t('weight.trend'),
						data: trend.map((p) => p.value),
						borderColor: cssVar('--fat'),
						borderWidth: 2.5,
						pointRadius: 0,
						tension: 0.3
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
				scales: {
					x: {
						grid: { display: false },
						ticks: {
							color: cssVar('--label-2'),
							maxTicksLimit: 6,
							maxRotation: 0,
							font: { size: 11 }
						}
					},
					y: {
						grid: { color: cssVar('--sep') },
						border: { display: false },
						ticks: { color: cssVar('--label-2'), maxTicksLimit: 5, font: { size: 11 } }
					}
				}
			}
		};
	}
</script>

<svelte:head><title>{t('weight.title')} · Nutrition</title></svelte:head>

<main class="page weight-page">
	<BackNav href="/insights" label={t('insights.title')} />
	<h1 class="large-title">{t('weight.title')}</h1>

	<div class="w-cols">
		<div>
			<form class="group" onsubmit={add} data-testid="weight-form">
				<div class="row">
					<label class="grow" for="w-kg">{t('weight.kg')}</label><input
						id="w-kg"
						type="number"
						inputmode="decimal"
						step="0.1"
						min="20"
						max="400"
						bind:value={kg}
						data-testid="weight-kg"
					/>
				</div>
				<div class="row">
					<label class="grow" for="w-date">{t('weight.date')}</label><input
						id="w-date"
						type="date"
						bind:value={date}
						max={app.today}
					/>
				</div>
				<div class="row">
					<label for="w-note">{t('weight.note')}</label><input
						id="w-note"
						bind:value={note}
						placeholder={t('weight.notePlaceholder')}
					/>
				</div>
				<div class="row">
					<button class="btn" type="submit" disabled={busy || !kg} data-testid="weight-submit"
						>{t('weight.add')}</button
					>
				</div>
			</form>

			{#if latest}
				<div class="tiles">
					<div class="tile">
						<span class="t-label">{t('weight.latest')}</span><span class="t-val tabular"
							>{fmt(latest.kg, 1)}<small> kg</small></span
						>
					</div>
					<div class="tile" data-testid="weight-change">
						<span class="t-label">{t('weight.change')}</span><span class="t-val tabular"
							>{change === null ? '–' : (change > 0 ? '+' : '') + fmt(change, 1)}<small>
								kg</small
							></span
						>
						<span class="t-sub">{t(`weight.rangeLong.${range}`)}</span>
					</div>
				</div>
				<section class="card">
					<div class="card-head">
						<h2>{t('weight.trend')}</h2>
						<div class="segmented range" role="group" aria-label={t('weight.range')}>
							{#each RANGES as r (r)}
								<button
									aria-pressed={range === r}
									onclick={() => setRange(r)}
									data-testid="weight-range-{r}">{t(`weight.ranges.${r}`)}</button
								>
							{/each}
						</div>
					</div>
					{#if series.length > 1}
						{#key `${list.length}-${range}`}<ChartCanvas
								config={chartConfig}
								label={t('weight.trend')}
								height={viewport.ultra ? 440 : viewport.desktop ? 320 : 200}
							/>{/key}
					{:else}
						<p class="empty-range">{t('weight.noneInRange')}</p>
					{/if}
				</section>
			{/if}
		</div>
		{#if list.length}
			<div class="w-history">
				<h2 class="section-header">{t('weight.history')}</h2>
				<ul class="group" data-testid="weight-list">
					{#each list as w (w.id)}
						<li class="row">
							<span class="grow">
								<span class="row-title"
									>{fmtDate(w.date, {
										weekday: 'short',
										day: 'numeric',
										month: 'short',
										year: 'numeric'
									})}</span
								>
								{#if w.note}<span class="row-sub">{w.note}</span>{/if}
							</span>
							<strong class="tabular">{fmt(w.kg, 1)} kg</strong>
							<button class="del" onclick={() => remove(w)} aria-label={t('app.delete')}>×</button>
						</li>
					{/each}
					{#if next}
						<li>
							<button
								class="row more"
								onclick={loadMore}
								disabled={loadingMore}
								data-testid="weight-more">{t('weight.loadMore')}</button
							>
						</li>
					{/if}
				</ul>
				{#if !next && total > 50}
					<p class="section-footer">{t('weight.allLoaded', { n: total })}</p>
				{/if}
			</div>
		{:else if loaded}
			<p class="empty">{t('weight.empty')}</p>
		{/if}
	</div>
</main>

<style>
	.row label[for='w-note'] {
		flex: none;
	}
	.row input[type='date'] {
		flex: none;
	}
	.grow {
		display: flex;
		flex-direction: column;
	}
	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 16px;
	}
	.tile {
		background: var(--bg-elev);
		border-radius: var(--radius);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
	}
	.t-label {
		font-size: 13px;
		color: var(--label-2);
	}
	.t-val {
		font-family: var(--font-rounded);
		font-size: 28px;
		font-weight: 700;
	}
	.t-val small {
		font-size: 15px;
		color: var(--label-2);
	}
	.card {
		background: var(--bg-elev);
		border-radius: var(--radius-lg);
		padding: 14px;
		margin-top: 12px;
	}
	.card h2 {
		font-size: 17px;
		margin: 0;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}
	.range {
		flex: none;
		width: 200px;
	}
	.range button {
		font-size: 13px;
		min-height: 28px;
	}
	.t-sub {
		font-size: 12px;
		color: var(--label-2);
	}
	.empty-range {
		margin: 24px 0;
		text-align: center;
		color: var(--label-2);
		font-size: 15px;
	}
	.more {
		width: 100%;
		border: 0;
		background: var(--bg-elev);
		color: var(--tint);
		justify-content: center;
		font: inherit;
	}
	/* phones: the range control gets its own line under the title */
	@media (max-width: 639px) {
		.card-head {
			flex-wrap: wrap;
		}
		.range {
			width: 100%;
		}
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger-text);
		font-size: 22px;
		width: 32px;
	}

	/* ---------- desktop: entry and trend | history ---------- */
	@media (min-width: 1400px) and (orientation: landscape) {
		.weight-page {
			--page-max: 1240px;
		}
		.w-cols {
			display: grid;
			grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
			gap: 0 28px;
			align-items: start;
		}
		.w-history > .section-header:first-child {
			margin-top: 0;
		}
	}

	/* ---------- ultra: wider entry, trend and history ---------- */
	@media (min-width: 1800px) and (orientation: landscape) {
		.weight-page {
			--page-max: 2000px;
		}
	}
</style>
