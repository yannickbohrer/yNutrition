<script lang="ts">
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import BackNav from '#lib/components/BackNav.svelte';
	import ChartCanvas from '#lib/components/ChartCanvas.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { cssVar } from '#lib/charts.ts';
	import { movingAverage } from '#lib/nutrition.ts';
	import { fmt, fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import type { WeightDTO } from '#lib/types.ts';

	let list = $state<WeightDTO[]>([]);
	let kg = $state<number | null>(null);
	let date = $state(app.today);
	let note = $state('');
	let busy = $state(false);

	onMount(load);
	async function load() {
		list = await api.weights();
		if (kg === null && list[0]) kg = list[0].kg;
	}

	async function add(e: Event) {
		e.preventDefault();
		if (!kg) return;
		busy = true;
		try {
			await api.addWeight({ date, kg: Number(kg), note: note || undefined });
			note = '';
			toast(t('weight.saved'));
			await load();
		} finally {
			busy = false;
		}
	}

	async function remove(id: number) {
		await api.deleteWeight(id);
		await load();
	}

	const asc = $derived([...list].reverse().slice(-90));
	const trend = $derived(
		movingAverage(
			asc.map((w) => ({ date: w.date, value: w.kg })),
			7
		)
	);
	const latest = $derived(list[0]);
	const change = $derived(list.length > 1 ? list[0].kg - list[list.length - 1].kg : null);

	function chartConfig(): ChartConfiguration {
		return {
			type: 'line',
			data: {
				labels: asc.map((w) => fmtDate(w.date, { day: 'numeric', month: 'numeric' })),
				datasets: [
					{
						label: t('weight.kg'),
						data: asc.map((w) => w.kg),
						borderColor: 'transparent',
						backgroundColor: cssVar('--label-3'),
						pointRadius: 3,
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

<main class="page">
	<BackNav href="/insights" label={t('insights.title')} />
	<h1 class="large-title">{t('weight.title')}</h1>

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

	{#if list.length}
		<div class="tiles">
			<div class="tile">
				<span class="t-label">{t('weight.latest')}</span><span class="t-val tabular"
					>{fmt(latest.kg, 1)}<small> kg</small></span
				>
			</div>
			<div class="tile">
				<span class="t-label">{t('weight.change')}</span><span class="t-val tabular"
					>{change === null ? '–' : (change > 0 ? '+' : '') + fmt(change, 1)}<small>
						kg</small
					></span
				>
			</div>
		</div>
		{#if asc.length > 1}
			<section class="card">
				<h2>{t('weight.trend')}</h2>
				{#key list}<ChartCanvas config={chartConfig} label={t('weight.trend')} height={200} />{/key}
			</section>
		{/if}
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
					<button class="del" onclick={() => remove(w.id)} aria-label={t('app.delete')}>×</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{t('weight.empty')}</p>
	{/if}
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
		margin: 0 0 8px;
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger);
		font-size: 22px;
		width: 32px;
	}
</style>
