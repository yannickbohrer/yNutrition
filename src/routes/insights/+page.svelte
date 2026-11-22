<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
	import ChartCanvas from '#lib/components/ChartCanvas.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api, type Breakdown } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { viewport } from '#lib/stores/viewport.svelte.ts';
	import { cssVar } from '#lib/charts.ts';
	import {
		addDays,
		addMonths,
		diffDays,
		endOfMonth,
		startOfMonth,
		startOfWeek
	} from '#lib/dates.ts';
	import { fmt, fmtAmount, fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import { HEADLINE_KEYS, NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import type { InsightsDTO } from '#lib/server/insights.ts';
	import { onMount } from 'svelte';
	import {
		SOURCE_SORTS,
		sortContributions,
		type Contribution,
		type SourceSort
	} from '#lib/nutrition.ts';

	type Mode = 'week' | 'month' | 'year';
	type Basis = 'current' | 'then';
	let mode = $state<Mode>('week');
	let offset = $state(0);
	let data = $state<InsightsDTO | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let showWeight = $state(false);
	/** which targets the figures are compared with: today's (default) or those that applied then */
	let basis = $state<Basis>('current');
	let nutrient = $state<NutrientKey>('energy_kcal');
	type BdPeriod = 'day' | 'range' | 'all';
	let bdPeriod = $state<BdPeriod>('range');
	let bdSort = $state<SourceSort>('value');
	let bdDir = $state<'asc' | 'desc'>('desc');
	let bd = $state<Breakdown | null>(null);
	// the saved choice is read on mount (SSR renders the defaults), so wait for it before fetching
	let prefsReady = $state(false);
	const PREFS_KEY = 'insights.prefs';
	const OLD_PREFS_KEY = 'insights.breakdown';
	let innerHeight = $state(0);
	// ultra: the chart takes the window height left under the title, period bar and card chrome
	const ultraChartHeight = $derived(Math.min(900, Math.max(480, innerHeight - 330)));

	function periodOf(m: Mode, off: number, today: string) {
		if (m === 'week') {
			const from = addDays(startOfWeek(today), off * 7);
			return { from, to: addDays(from, 6) };
		}
		if (m === 'month') {
			const from = addMonths(startOfMonth(today), off);
			return { from, to: endOfMonth(from) };
		}
		const y = Number(today.slice(0, 4)) + off;
		return { from: `${y}-01-01`, to: `${y}-12-31` };
	}
	/** offset (relative to today's period) of the period containing `date` */
	function offsetOf(m: Mode, date: string): number {
		const today = app.today;
		if (m === 'week') return Math.round(diffDays(startOfWeek(today), startOfWeek(date)) / 7);
		const months = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
		if (m === 'month') return months(date) - months(today);
		return Number(date.slice(0, 4)) - Number(today.slice(0, 4));
	}

	const range = $derived(periodOf(mode, offset, app.today));
	// paging back stops at the period of the first entry ever logged
	const minOffset = $derived(data?.firstDate ? Math.min(0, offsetOf(mode, data.firstDate)) : 0);

	function setMode(m: Mode) {
		mode = m;
		offset = 0;
	}
	function go(delta: number) {
		offset = Math.max(minOffset, Math.min(0, offset + delta));
	}

	// responses can arrive out of order when paging quickly: only the latest request counts
	let insightsReq = 0;
	function loadInsights() {
		const { from, to } = range;
		const id = ++insightsReq;
		loading = true;
		api
			.insights(from, to, mode === 'year' ? 'month' : 'day')
			.then((d) => {
				if (id !== insightsReq) return;
				data = d;
				failed = false;
			})
			.catch(() => {
				if (id === insightsReq) failed = true;
			})
			.finally(() => {
				if (id === insightsReq) loading = false;
			});
	}
	$effect(loadInsights);

	onMount(() => {
		try {
			const raw = localStorage.getItem(PREFS_KEY) ?? localStorage.getItem(OLD_PREFS_KEY);
			const p = JSON.parse(raw ?? '{}');
			if (['day', 'range', 'all'].includes(p.period)) bdPeriod = p.period;
			if (SOURCE_SORTS.includes(p.sort)) bdSort = p.sort;
			if (p.dir === 'asc' || p.dir === 'desc') bdDir = p.dir;
			if (p.basis === 'current' || p.basis === 'then') basis = p.basis;
		} catch {
			// storage blocked or garbled: keep the defaults
		}
		prefsReady = true;
	});
	$effect(() => {
		if (!prefsReady) return;
		const prefs = JSON.stringify({ period: bdPeriod, sort: bdSort, dir: bdDir, basis });
		try {
			localStorage.setItem(PREFS_KEY, prefs);
			localStorage.removeItem(OLD_PREFS_KEY);
		} catch {
			// not persisted; the page works the same
		}
	});
	let bdReq = 0;
	$effect(() => {
		if (!prefsReady) return;
		const n = nutrient;
		const r =
			bdPeriod === 'all' ? 'all' : bdPeriod === 'day' ? { from: app.today, to: app.today } : range;
		const id = ++bdReq;
		api
			.breakdown(r, n)
			.then((b) => {
				if (id === bdReq) bd = b;
			})
			.catch(() => {
				if (id === bdReq) bd = null;
			});
	});

	/** figures for the chosen comparison; the historical one only exists after a target change */
	const useThen = $derived(basis === 'then' && !!data?.hasTargetHistory);
	const view = $derived.by(() => {
		if (!data) return null;
		const h = data.historical;
		return useThen
			? {
					targets: h.targets,
					on: h.onTargetDays,
					over: h.overDays,
					under: h.underDays
				}
			: {
					targets: data.targets,
					on: data.onTargetDays,
					over: data.overDays,
					under: data.underDays
				};
	});
	const totalDays = $derived(diffDays(range.from, range.to) + 1);

	// swipe left/right on the chart pages through periods (keyboard: ← / →)
	let swipe: { x: number; y: number; id: number } | null = null;
	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse') return;
		swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
	}
	function onPointerUp(e: PointerEvent) {
		if (!swipe || swipe.id !== e.pointerId) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
	}
	/** attach the swipe gesture (pointer buttons and ← / → keys do the same) */
	function swipeable(el: HTMLElement) {
		const cancel = () => (swipe = null);
		el.addEventListener('pointerdown', onPointerDown);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('pointercancel', cancel);
		return () => {
			el.removeEventListener('pointerdown', onPointerDown);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('pointercancel', cancel);
		};
	}
	function onKey(e: KeyboardEvent) {
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
		const el = e.target as HTMLElement | null;
		if (el?.closest('input, select, textarea, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') go(-1);
		else if (e.key === 'ArrowRight') go(1);
	}

	const bdItems = $derived(bd ? sortContributions(bd.items, bdSort, bdDir).slice(0, 12) : []);
	const dirLabel = $derived(
		t(
			bdSort === 'last'
				? bdDir === 'desc'
					? 'insights.sortDir.newest'
					: 'insights.sortDir.oldest'
				: `insights.sortDir.${bdDir}`
		)
	);
	function setSort(s: SourceSort) {
		bdSort = s;
		// a new metric starts from its natural order (highest / most recent first)
		bdDir = 'desc';
	}
	function fmtQty(v: number, basis: 'g' | 'ml') {
		if (v >= 1000) return `${fmt(v / 1000, 1)} ${basis === 'g' ? 'kg' : 'l'}`;
		return `${fmtAmount(v)} ${basis}`;
	}
	function metricLine(it: Contribution): string | null {
		const u = unitOf(nutrient);
		switch (bdSort) {
			case 'count':
				return t('insights.metric.count', { n: it.count });
			case 'amount':
				return t('insights.metric.amount', { v: fmtQty(it.amount, it.basis) });
			case 'perServing':
				return t('insights.metric.perServing', { v: `${fmtAmount(it.perServing)} ${u}` });
			case 'per100':
				return t('insights.metric.per100', { v: `${fmtAmount(it.per100)} ${u}`, b: it.basis });
			case 'last': {
				const sameYear = it.last.slice(0, 4) === app.today.slice(0, 4);
				return t('insights.metric.last', {
					d: fmtDate(it.last, {
						day: 'numeric',
						month: 'short',
						...(sameYear ? {} : { year: 'numeric' })
					})
				});
			}
			default:
				return null;
		}
	}

	const label = $derived(
		mode === 'week'
			? `${fmtDate(range.from, { day: 'numeric', month: 'short' })} – ${fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
			: mode === 'month'
				? fmtDate(range.from, { month: 'long', year: 'numeric' })
				: range.from.slice(0, 4)
	);
	const hasWeights = $derived(!!data?.days.some((d) => d.weight !== null));

	const reduceMotion =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function chartConfig(): ChartConfiguration {
		const d = data!;
		const label2 = cssVar('--label-2');
		const sep = cssVar('--sep');
		const then = useThen;
		const targetOf = (x: InsightsDTO['days'][number]) => (then ? x.targetThen : d.targets.kcal);
		const labels = d.days.map((x) =>
			fmtDate(
				x.date,
				mode === 'week'
					? { weekday: 'short' }
					: mode === 'month'
						? { day: 'numeric' }
						: { month: 'short' }
			)
		);
		const colors = d.days.map((x) =>
			(x.kcal ?? 0) > targetOf(x) * 1.1 ? cssVar('--over') : cssVar('--kcal')
		);
		const weightPts = d.days.map((x) => x.weight);
		return {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						type: 'bar',
						label: 'kcal',
						data: d.days.map((x) => x.kcal ?? 0),
						backgroundColor: colors,
						borderRadius: 4,
						maxBarThickness: 28,
						yAxisID: 'y',
						order: 2
					},
					{
						type: 'line',
						label: t('insights.target'),
						data: d.days.map(targetOf),
						borderColor: label2,
						// current target: dashed and flat; targets from the time: solid steps
						borderDash: then ? [] : [5, 4],
						stepped: then ? 'middle' : false,
						borderWidth: 1.5,
						pointRadius: 0,
						yAxisID: 'y',
						order: 1
					},
					...(showWeight && hasWeights
						? [
								{
									type: 'line' as const,
									label: t('insights.weight'),
									data: weightPts,
									borderColor: cssVar('--fat'),
									backgroundColor: cssVar('--fat'),
									spanGaps: true,
									pointRadius: 3,
									borderWidth: 2,
									yAxisID: 'y2',
									order: 0
								}
							]
						: [])
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: reduceMotion ? false : { duration: 300 },
				plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
				// year: tapping a month opens it
				onClick:
					mode === 'year'
						? (_e, els) => {
								const i = els[0]?.index;
								if (i === undefined || !data) return;
								const month = data.days[i].date;
								mode = 'month';
								offset = offsetOf('month', month);
							}
						: undefined,
				onHover: (e, els) => {
					const el = e.native?.target as HTMLElement | undefined;
					if (el) el.style.cursor = mode === 'year' && els.length ? 'pointer' : '';
				},
				scales: {
					x: {
						grid: { display: false },
						ticks: { color: label2, maxRotation: 0, autoSkipPadding: 6, font: { size: 11 } }
					},
					y: {
						beginAtZero: true,
						grid: { color: sep },
						border: { display: false },
						ticks: { color: label2, font: { size: 11 }, maxTicksLimit: 5 }
					},
					y2: {
						display: showWeight && hasWeights,
						position: 'right',
						grid: { display: false },
						border: { display: false },
						ticks: { color: label2, font: { size: 11 }, maxTicksLimit: 5 }
					}
				}
			}
		};
	}

	let quickKg = $state<number | null>(null);
	async function quickWeight(e: Event) {
		e.preventDefault();
		if (!quickKg) return;
		await api.addWeight({ date: app.today, kg: Number(quickKg) });
		quickKg = null;
		toast(t('weight.saved'));
		loadInsights();
	}

	const macroColors = {
		protein: 'var(--protein)',
		carbs: 'var(--carbs)',
		fat: 'var(--fat)',
		fiber: 'var(--fiber)'
	} as const;
	const unitOf = (k: NutrientKey) => NUTRIENTS[k].unit;
</script>

<svelte:head><title>{t('insights.title')} · Nutrition</title></svelte:head>
<svelte:window bind:innerHeight onkeydown={onKey} />

<main class="page insights-page">
	<h1 class="large-title">{t('insights.title')}</h1>

	<div class="period-bar">
		<div class="segmented" role="group">
			{#each ['week', 'month', 'year'] as const as m (m)}
				<button aria-pressed={mode === m} onclick={() => setMode(m)} data-testid="mode-{m}"
					>{t(`insights.${m}`)}</button
				>
			{/each}
		</div>
		<div class="nav-row period">
			<button
				class="nav-btn"
				onclick={() => go(-1)}
				disabled={offset <= minOffset}
				aria-label={t('insights.prev')}
				data-testid="period-prev"><Icon name="chevronLeft" /></button
			>
			<span class="period-label">
				<strong data-testid="period-label">{label}</strong>
				<!-- only while paged away from today's period -->
				<button
					class="text-btn today-btn"
					class:hidden={offset === 0}
					disabled={offset === 0}
					aria-hidden={offset === 0}
					tabindex={offset === 0 ? -1 : 0}
					onclick={() => (offset = 0)}
					data-testid="period-today">{t('insights.backToToday')}</button
				>
			</span>
			<button
				class="nav-btn"
				onclick={() => go(1)}
				disabled={offset >= 0}
				aria-label={t('insights.next')}
				data-testid="period-next"><Icon name="chevronRight" /></button
			>
		</div>
	</div>

	<div class="ins-grid">
		{#if data && view}
			<section
				class="card a-chart"
				class:stale={loading}
				aria-busy={loading}
				data-from={data.from}
				data-testid="insights-chart"
				{@attach swipeable}
			>
				<div class="card-head">
					<h2>{mode === 'year' ? t('insights.kcalChartYear') : t('insights.kcalChart')}</h2>
					{#if hasWeights}
						<label class="toggle"
							><input type="checkbox" class="switch small" bind:checked={showWeight} />
							{t('insights.showWeight')}</label
						>
					{/if}
				</div>
				{#key `${showWeight}-${mode}`}
					<ChartCanvas
						config={chartConfig}
						label={mode === 'year' ? t('insights.kcalChartYear') : t('insights.kcalChart')}
						height={viewport.ultra
							? ultraChartHeight
							: viewport.desktop
								? 420
								: viewport.wide
									? 340
									: viewport.tablet
										? 300
										: 220}
					/>
				{/key}
				{#if data.loggedDays === 0}
					<p class="hint empty-period" data-testid="period-empty">
						{t(`insights.emptyPeriod.${mode}`)}
						{#if data.lastBefore}
							<button
								class="text-btn"
								onclick={() => (offset = offsetOf(mode, data!.lastBefore!))}
								data-testid="period-jump">{t('insights.jumpBack')}</button
							>
						{/if}
					</p>
				{:else}
					<p class="hint">
						{t('insights.loggedDays', { n: data.loggedDays, total: totalDays })}.
						{#if mode === 'year'}{t('insights.yearHint')}{/if}
					</p>
				{/if}
			</section>

			<div class="a-tiles" class:stale={loading}>
				<div class="tiles">
					<div class="tile" data-testid="avg-kcal">
						<span class="t-label">{t('insights.avgPerDay')}</span>
						<span class="t-val tabular">{fmt(data.avg.kcal)}</span>
						<span class="t-sub">/ {fmt(view.targets.kcal)} kcal</span>
					</div>
					<div class="tile" data-testid="adherence">
						<span class="t-label">{t('insights.adherence')}</span>
						<span class="t-val tabular"
							>{data.loggedDays ? fmt((view.on / data.loggedDays) * 100) : '–'}<small>%</small
							></span
						>
						<span class="t-sub"
							>{view.on}
							{t('insights.onTarget')} · {view.over}
							{t('insights.over')} · {view.under}
							{t('insights.under')}</span
						>
					</div>
				</div>
				<p class="section-footer">
					{t('insights.adherenceHint')}.
					{#if data.hasTargetHistory}
						<span data-testid="target-basis"
							>{useThen ? t('insights.basisThen') : t('insights.basisCurrent')}</span
						>
						<button
							class="text-btn"
							onclick={() => (basis = useThen ? 'current' : 'then')}
							data-testid="target-basis-toggle"
							>{useThen ? t('insights.showCurrent') : t('insights.showThen')}</button
						>
					{/if}
				</p>
			</div>

			<section class="a-macros" class:stale={loading}>
				<h2 class="section-header">{t('insights.macros')}</h2>
				<ul class="group">
					{#each HEADLINE_KEYS as k (k)}
						{@const v = data.avg[k]}
						{@const tg = view.targets[k]}
						<li class="row macro">
							<span class="dot" style:background={macroColors[k]}></span>
							<span class="grow">{t(`macros.${k}`)}</span>
							<span class="tabular">{fmt(v)} / {fmt(tg)} g</span>
							<!-- fibre has no energy share: keep the column for alignment -->
							<span class="share tabular"
								>{k === 'fiber' ? '' : `${fmt(data.energyShares[k])}%`}</span
							>
						</li>
						<li class="bar-li">
							<div class="bar">
								<div
									style:width="{tg ? Math.min(100, (v / tg) * 100) : 0}%"
									style:background={macroColors[k]}
								></div>
							</div>
						</li>
					{/each}
				</ul>
				<p class="section-footer">
					{t('insights.energyShare')}: P {fmt(data.energyShares.protein)}% · KH {fmt(
						data.energyShares.carbs
					)}% · F {fmt(data.energyShares.fat)}%
				</p>
			</section>
		{:else if failed}
			<p class="empty a-chart">
				{t('app.error')}
				<button class="text-btn" onclick={loadInsights}>{t('app.retry')}</button>
			</p>
		{:else}
			<p class="empty a-chart">{t('app.loading')}</p>
		{/if}

		<section class="a-bd">
			<h2 class="section-header">{t('insights.breakdown')}</h2>
			<div class="bd-controls">
				<select
					bind:value={nutrient}
					aria-label={t('insights.nutrient')}
					data-testid="breakdown-nutrient"
				>
					{#each NUTRIENT_KEYS.filter((k) => k !== 'energy_kj') as k (k)}<option value={k}
							>{t(`nutrient.${k}`)}</option
						>{/each}
				</select>
				<div class="segmented" role="group" aria-label={t('insights.period')}>
					<button aria-pressed={bdPeriod === 'day'} onclick={() => (bdPeriod = 'day')}
						>{t('insights.day')}</button
					>
					<button aria-pressed={bdPeriod === 'range'} onclick={() => (bdPeriod = 'range')}
						>{t(`insights.${mode}`)}</button
					>
					<button
						aria-pressed={bdPeriod === 'all'}
						onclick={() => (bdPeriod = 'all')}
						data-testid="breakdown-all">{t('insights.allTime')}</button
					>
				</div>
			</div>
			<div class="bd-controls">
				<label class="bd-sort">
					<span class="bd-sort-label">{t('insights.sortBy')}</span>
					<select
						value={bdSort}
						onchange={(e) => setSort(e.currentTarget.value as SourceSort)}
						data-testid="breakdown-sort"
					>
						{#each SOURCE_SORTS as s (s)}<option value={s}>{t(`insights.sort.${s}`)}</option>{/each}
					</select>
				</label>
				<button
					class="bd-dir"
					onclick={() => (bdDir = bdDir === 'desc' ? 'asc' : 'desc')}
					aria-label={dirLabel}
					title={dirLabel}
					data-testid="breakdown-dir"
				>
					<Icon name={bdDir === 'desc' ? 'sortDesc' : 'sortAsc'} size={20} />
				</button>
			</div>
			{#if bd}
				{#if bd.items.length}
					<ul class="group" data-testid="breakdown-list">
						{#each bdItems as it, i (it.key)}
							{@const line = metricLine(it)}
							<li class="row bd-row">
								<span class="rank tabular">{i + 1}</span>
								<span class="grow">
									<span class="row-title">{it.label}</span>
									{#if line}<span class="row-sub tabular">{line}</span>{/if}
									<span class="share-bar"><span style:width="{it.share}%"></span></span>
								</span>
								<span class="bd-val tabular"
									>{fmtAmount(it.value)} {unitOf(nutrient)}<small>{fmt(it.share, 1)}%</small></span
								>
							</li>
						{/each}
					</ul>
					<p class="section-footer">
						{t('insights.total')}: {fmtAmount(bd.total)}
						{unitOf(nutrient)}
						{#if bd.missing}· <span class="warn"
								>{t('insights.missingEntries', { n: bd.missing })}</span
							>{/if}
					</p>
				{:else}
					<p class="empty">{t('insights.noData')}</p>
				{/if}
			{/if}
		</section>

		<section class="a-side">
			<h2 class="section-header">{t('weight.quickAdd')}</h2>
			<form class="group quick" onsubmit={quickWeight}>
				<div class="row">
					<label class="grow" for="quick-kg">{t('weight.title')} ({t('day.today')})</label>
					<input
						id="quick-kg"
						type="number"
						inputmode="decimal"
						step="0.1"
						min="20"
						max="400"
						placeholder="kg"
						bind:value={quickKg}
						data-testid="quick-weight"
					/>
					<button class="btn small" type="submit" disabled={!quickKg}>{t('app.save')}</button>
				</div>
			</form>

			<div class="group links">
				<a class="row" href="/insights/weight" data-testid="weight-link"
					><Icon name="scale" /><span class="grow">{t('insights.weightLink')}</span><Icon
						name="chevronRight"
						size={16}
					/></a
				>
				<a class="row" href="/settings/data"
					><Icon name="download" /><span class="grow">{t('insights.export')}</span><Icon
						name="chevronRight"
						size={16}
					/></a
				>
			</div>
		</section>
	</div>
</main>

<style>
	.period {
		margin: 8px -8px 4px;
	}
	.period-label {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}
	/* room to spare: keep the label centred and hang "Heute" beside it */
	@media (min-width: 400px) {
		.period-label {
			position: relative;
		}
		.today-btn {
			position: absolute;
			left: calc(100% + 10px);
			white-space: nowrap;
		}
	}
	.text-btn {
		border: 0;
		background: none;
		padding: 2px 0;
		color: var(--tint);
		font: inherit;
		cursor: pointer;
	}
	.today-btn {
		font-size: 15px;
	}
	/* out of the layout when on today's period, so the label stays centred */
	.today-btn.hidden {
		display: none;
	}
	.stale {
		opacity: 0.6;
		transition: opacity 150ms ease;
	}
	.a-chart,
	.a-tiles,
	.a-macros {
		transition: opacity 150ms ease;
	}
	.a-chart.card {
		/* horizontal swipes page through periods; vertical ones still scroll */
		touch-action: pan-y;
	}
	.empty-period .text-btn {
		font-size: inherit;
	}
	.card {
		background: var(--bg-elev);
		border-radius: var(--radius-lg);
		padding: 14px 14px 10px;
		margin-top: 6px;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
		gap: 8px;
	}
	.card h2 {
		font-size: 17px;
		margin: 0;
	}
	.card .hint {
		margin: 6px 0 0;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--label-2);
	}
	.tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 12px;
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
		font-size: 30px;
		font-weight: 700;
	}
	.t-val small {
		font-size: 17px;
	}
	.t-sub {
		font-size: 12px;
		color: var(--label-2);
	}
	.macro {
		min-height: 40px;
		padding-bottom: 2px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 5px;
		flex: none;
	}
	.share {
		color: var(--label-2);
		width: 44px;
		text-align: right;
		font-size: 13px;
	}
	.group > li.bar-li::before {
		display: none;
	}
	.bar-li {
		padding: 0 16px 10px 38px;
		background: var(--bg-elev);
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--fill);
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		border-radius: 3px;
	}
	.bd-controls {
		display: flex;
		gap: 8px;
		margin-bottom: 10px;
		align-items: center;
	}
	.bd-controls select {
		flex: 1;
		min-width: 0;
		min-height: 36px;
		border-radius: 9px;
		border: 0;
		background: var(--bg-elev);
		padding: 0 10px;
	}
	.bd-controls .segmented {
		width: 228px;
		flex: none;
	}
	.bd-sort {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		border-radius: 9px;
		background: var(--bg-elev);
		padding-left: 10px;
	}
	.bd-sort-label {
		color: var(--label-2);
		font-size: 14px;
		white-space: nowrap;
		flex: none;
	}
	.bd-controls .bd-sort select {
		padding-left: 0;
		font-weight: 500;
	}
	.bd-dir {
		flex: none;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 9px;
		background: var(--bg-elev);
		color: var(--tint);
	}
	.bd-row {
		min-height: 54px;
	}
	.rank {
		width: 18px;
		color: var(--label-3);
		font-size: 13px;
		flex: none;
	}
	.share-bar {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--fill);
		margin-top: 6px;
		overflow: hidden;
	}
	.share-bar span {
		display: block;
		height: 100%;
		background: var(--tint);
	}
	.bd-val {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-size: 15px;
		flex: none;
	}
	.bd-val small {
		color: var(--label-2);
		font-size: 12px;
	}
	.links {
		margin-top: 28px;
	}
	.quick input {
		max-width: 90px;
		background: var(--fill) !important;
		border-radius: 8px;
		padding: 6px 8px !important;
	}
	.links .row {
		color: var(--tint);
	}
	.links .grow {
		color: var(--label);
	}

	/* ---------- iPad portrait: chart on top, then two columns ---------- */
	@media (min-width: 640px) and (min-height: 560px), (min-width: 1000px) {
		.period-bar {
			display: flex;
			align-items: center;
			gap: 16px;
		}
		.period-bar .segmented {
			width: 240px;
			flex: none;
		}
		.period {
			flex: 1;
			margin: 0;
		}
		.ins-grid {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-areas:
				'chart chart'
				'tiles macros'
				'bd side';
			gap: 0 24px;
			align-items: start;
			margin-top: 8px;
		}
		.a-chart {
			grid-area: chart;
		}
		.a-tiles {
			grid-area: tiles;
		}
		.a-macros {
			grid-area: macros;
		}
		.a-bd {
			grid-area: bd;
		}
		.a-side {
			grid-area: side;
		}
		/* align the column tops: tiles and macros start together, as do breakdown and weight */
		.a-tiles .tiles {
			margin-top: 24px;
		}
		.a-macros > .section-header:first-child {
			margin-top: 24px;
		}
		.a-tiles .tiles {
			grid-template-columns: 1fr;
		}
		.a-side .links {
			margin-top: 24px;
		}
	}

	/* ---------- iPad landscape: chart + breakdown left, figures right ---------- */
	@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape),
		(min-width: 1000px) and (orientation: landscape) {
		.insights-page {
			--page-max: 1240px;
		}
		.ins-grid {
			grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr);
			grid-template-areas:
				'chart tiles'
				'chart macros'
				'bd side';
			gap: 0 28px;
		}
		.a-chart {
			margin-top: 0;
		}
		.a-tiles .tiles {
			margin-top: 0;
			grid-template-columns: 1fr 1fr;
		}
		.a-macros > .section-header:first-child {
			margin-top: 24px;
		}
	}

	/* ---------- laptops and up: arrows next to the date, not at both ends of the page ---------- */
	@media (min-width: 1400px) and (orientation: landscape) {
		.period {
			flex: none;
			gap: 4px;
		}
		.period strong {
			min-width: 220px;
			text-align: center;
		}
	}

	/* ---------- ultra: chart | figures | breakdown ---------- */
	@media (min-width: 1800px) and (orientation: landscape) {
		.insights-page {
			--page-max: none;
		}
		.ins-grid {
			grid-template-columns: minmax(0, 5fr) minmax(320px, 3fr) minmax(320px, 3fr);
			grid-template-rows: auto auto 1fr;
			grid-template-areas:
				'chart tiles bd'
				'chart macros bd'
				'chart side bd';
		}
		.a-bd > .section-header:first-child {
			margin-top: 0;
		}
	}
</style>
