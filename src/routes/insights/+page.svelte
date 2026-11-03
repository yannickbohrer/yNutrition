<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
	import ChartCanvas from '#lib/components/ChartCanvas.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api, type Breakdown } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { viewport } from '#lib/stores/viewport.svelte.ts';
	import { cssVar } from '#lib/charts.ts';
	import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from '#lib/dates.ts';
	import { fmt, fmtAmount, fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import type { InsightsDTO } from '#lib/server/insights.ts';

	let mode = $state<'week' | 'month'>('week');
	let offset = $state(0);
	let data = $state<InsightsDTO | null>(null);
	let showWeight = $state(false);
	let nutrient = $state<NutrientKey>('energy_kcal');
	let bdPeriod = $state<'day' | 'range'>('range');
	let bd = $state<Breakdown | null>(null);

	const range = $derived.by(() => {
		if (mode === 'week') {
			const from = addDays(startOfWeek(app.today), offset * 7);
			return { from, to: addDays(from, 6) };
		}
		const from = addMonths(startOfMonth(app.today), offset);
		return { from, to: endOfMonth(from) };
	});

	$effect(() => {
		const { from, to } = range;
		api.insights(from, to).then((d) => (data = d));
	});
	$effect(() => {
		const n = nutrient;
		const { from, to } = bdPeriod === 'day' ? { from: app.today, to: app.today } : range;
		api.breakdown(from, to, n).then((b) => (bd = b));
	});

	const label = $derived(
		mode === 'week'
			? `${fmtDate(range.from, { day: 'numeric', month: 'short' })} – ${fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
			: fmtDate(range.from, { month: 'long', year: 'numeric' })
	);
	const hasWeights = $derived(!!data?.days.some((d) => d.weight !== null));

	function chartConfig(): ChartConfiguration {
		const d = data!;
		const label2 = cssVar('--label-2');
		const sep = cssVar('--sep');
		const target = d.targets.kcal;
		const labels = d.days.map((x) =>
			fmtDate(x.date, mode === 'week' ? { weekday: 'short' } : { day: 'numeric' })
		);
		const colors = d.days.map((x) =>
			(x.kcal ?? 0) > target * 1.1 ? cssVar('--over') : cssVar('--kcal')
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
						data: d.days.map(() => target),
						borderColor: label2,
						borderDash: [5, 4],
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
				animation: { duration: 300 },
				plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
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
		const { from, to } = range;
		data = await api.insights(from, to);
	}

	const macroColors = {
		protein: 'var(--protein)',
		carbs: 'var(--carbs)',
		fat: 'var(--fat)'
	} as const;
	const unitOf = (k: NutrientKey) => NUTRIENTS[k].unit;
</script>

<svelte:head><title>{t('insights.title')} · Nutrition</title></svelte:head>

<main class="page insights-page">
	<h1 class="large-title">{t('insights.title')}</h1>

	<div class="period-bar">
		<div class="segmented" role="group">
			<button
				aria-pressed={mode === 'week'}
				onclick={() => ((mode = 'week'), (offset = 0))}
				data-testid="mode-week">{t('insights.week')}</button
			>
			<button
				aria-pressed={mode === 'month'}
				onclick={() => ((mode = 'month'), (offset = 0))}
				data-testid="mode-month">{t('insights.month')}</button
			>
		</div>
		<div class="nav-row period">
			<button class="nav-btn" onclick={() => offset--} aria-label={t('insights.prev')}
				><Icon name="chevronLeft" /></button
			>
			<strong>{label}</strong>
			<button
				class="nav-btn"
				onclick={() => offset++}
				disabled={offset >= 0}
				aria-label={t('insights.next')}><Icon name="chevronRight" /></button
			>
		</div>
	</div>

	<div class="ins-grid">
		{#if data}
			<section class="card a-chart">
				<div class="card-head">
					<h2>{t('insights.kcalChart')}</h2>
					{#if hasWeights}
						<label class="toggle"
							><input type="checkbox" class="switch small" bind:checked={showWeight} />
							{t('insights.showWeight')}</label
						>
					{/if}
				</div>
				{#key showWeight}
					<ChartCanvas
						config={chartConfig}
						label={t('insights.kcalChart')}
						height={viewport.wide ? 340 : viewport.tablet ? 300 : 220}
					/>
				{/key}
				<p class="hint">
					{t('insights.loggedDays', { n: data.loggedDays, total: data.days.length })}
				</p>
			</section>

			<div class="a-tiles">
				<div class="tiles">
					<div class="tile" data-testid="avg-kcal">
						<span class="t-label">{t('insights.avgPerDay')}</span>
						<span class="t-val tabular">{fmt(data.avg.kcal)}</span>
						<span class="t-sub">/ {fmt(data.targets.kcal)} kcal</span>
					</div>
					<div class="tile">
						<span class="t-label">{t('insights.adherence')}</span>
						<span class="t-val tabular"
							>{data.loggedDays ? fmt((data.onTargetDays / data.loggedDays) * 100) : '–'}<small
								>%</small
							></span
						>
						<span class="t-sub"
							>{data.onTargetDays}
							{t('insights.onTarget')} · {data.overDays}
							{t('insights.over')} · {data.underDays}
							{t('insights.under')}</span
						>
					</div>
				</div>
				<p class="section-footer">{t('insights.adherenceHint')}</p>
			</div>

			<section class="a-macros">
				<h2 class="section-header">{t('insights.macros')}</h2>
				<ul class="group">
					{#each ['protein', 'carbs', 'fat'] as const as k (k)}
						{@const v = data.avg[k]}
						{@const tg = data.targets[k]}
						<li class="row macro">
							<span class="dot" style:background={macroColors[k]}></span>
							<span class="grow">{t(`macros.${k}`)}</span>
							<span class="tabular">{fmt(v)} / {fmt(tg)} g</span>
							<span class="share tabular">{fmt(data.energyShares[k])}%</span>
						</li>
						<li class="bar-li">
							<div class="bar">
								<div
									style:width="{Math.min(100, (v / tg) * 100)}%"
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
				<div class="segmented">
					<button aria-pressed={bdPeriod === 'day'} onclick={() => (bdPeriod = 'day')}
						>{t('insights.day')}</button
					>
					<button aria-pressed={bdPeriod === 'range'} onclick={() => (bdPeriod = 'range')}
						>{mode === 'week' ? t('insights.week') : t('insights.month')}</button
					>
				</div>
			</div>
			{#if bd}
				{#if bd.items.length}
					<ul class="group" data-testid="breakdown-list">
						{#each bd.items.slice(0, 12) as it, i (it.key)}
							<li class="row bd-row">
								<span class="rank tabular">{i + 1}</span>
								<span class="grow">
									<span class="row-title">{it.label}</span>
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
		width: 160px;
		flex: none;
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
	@media (min-width: 640px) and (min-height: 560px) {
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
	@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
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
</style>
