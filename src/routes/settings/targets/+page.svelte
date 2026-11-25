<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import BackNav from '#lib/components/BackNav.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import { MACRO_KEYS, gramsFromSplit, sanitizeSplit, splitFromGrams } from '#lib/macros.ts';
	import type { MacroSplit, NutrientTarget } from '#lib/types.ts';

	const cur = app.settings.targets;
	let kcal = $state(cur.energy_kcal);
	let fiber = $state(cur.fiber);
	/** macro targets in grams: what is saved in gram mode */
	let grams = $state<MacroSplit>({ protein: cur.protein, carbs: cur.carbs, fat: cur.fat });
	/** macro targets as % of kcal: what is saved in percent mode */
	let pct = $state<MacroSplit>(app.settings.macroSplit ?? splitFromGrams(cur.energy_kcal, cur));
	let mode = $state<'g' | 'pct'>(app.settings.macroSplit ? 'pct' : 'g');
	let extra = $state<{ key: NutrientKey; min: number | null; max: number | null }[]>(
		Object.entries(cur.extra).map(([k, v]) => ({
			key: k as NutrientKey,
			min: (v as NutrientTarget).min ?? null,
			max: (v as NutrientTarget).max ?? null
		}))
	);
	let addKey = $state<NutrientKey | ''>('');

	const macroKcal = $derived(
		(grams.protein || 0) * 4 + (grams.carbs || 0) * 4 + (grams.fat || 0) * 9
	);
	const pctGrams = $derived(
		gramsFromSplit(kcal || 0, {
			protein: pct.protein || 0,
			carbs: pct.carbs || 0,
			fat: pct.fat || 0
		})
	);
	const pctSum = $derived(MACRO_KEYS.reduce((sum, k) => sum + (pct[k] || 0), 0));
	const macroLabel = {
		protein: 'targets.protein',
		carbs: 'targets.carbs',
		fat: 'targets.fat'
	} as const;

	/** Switching carries the current values over, so the targets don't jump. */
	function setMode(m: 'g' | 'pct') {
		if (m === mode) return;
		if (m === 'pct') {
			const p = splitFromGrams(kcal || 0, grams);
			pct = {
				protein: Math.max(1, p.protein),
				carbs: Math.max(1, p.carbs),
				fat: Math.max(1, p.fat)
			};
		} else grams = sanitizeSplit(pct) ? { ...pctGrams } : grams;
		mode = m;
	}
	const available = $derived(
		NUTRIENT_KEYS.filter(
			(k) =>
				!['energy_kcal', 'energy_kj', 'protein', 'carbs', 'fat', 'fiber'].includes(k) &&
				!extra.some((e) => e.key === k)
		)
	);

	function addExtra() {
		if (!addKey) return;
		extra = [...extra, { key: addKey, min: null, max: null }];
		addKey = '';
	}

	async function save() {
		const split = mode === 'pct' ? sanitizeSplit(pct) : null;
		if (mode === 'pct' && !split) return toast(t('targets.pctInvalid'));
		const ex: Record<string, NutrientTarget> = {};
		for (const e of extra)
			if (e.min || e.max) ex[e.key] = { min: e.min || null, max: e.max || null };
		const g = split ? gramsFromSplit(kcal, split) : grams;
		const s = await api.settings({
			targets: { energy_kcal: kcal, ...g, fiber, extra: ex },
			macroSplit: split
		});
		grams = { protein: s.targets.protein, carbs: s.targets.carbs, fat: s.targets.fat };
		app.settings = s;
		await invalidateAll();
		toast(t('targets.saved'));
	}
</script>

<svelte:head><title>{t('targets.title')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/settings" label={t('settings.title')} />
	<h1 class="large-title">{t('targets.title')}</h1>

	<h2 class="section-header">{t('targets.main')}</h2>
	<ul class="group">
		<li class="row">
			<label class="grow" for="t-kcal">{t('targets.kcal')}</label><input
				id="t-kcal"
				type="number"
				inputmode="numeric"
				min="500"
				max="10000"
				bind:value={kcal}
				data-testid="target-kcal"
			/><span class="u">kcal</span>
		</li>
		<li class="row">
			<label class="grow" for="t-fib">{t('targets.fiber')}</label><input
				id="t-fib"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={fiber}
				data-testid="target-fiber"
			/><span class="u">g</span>
		</li>
	</ul>

	<h2 class="section-header" id="macros-h">{t('targets.macros')}</h2>
	<div class="segmented mode" role="group" aria-labelledby="macros-h">
		<button type="button" aria-pressed={mode === 'g'} onclick={() => setMode('g')}
			>{t('targets.inGrams')}</button
		>
		<button
			type="button"
			aria-pressed={mode === 'pct'}
			onclick={() => setMode('pct')}
			data-testid="macro-mode-pct">{t('targets.inPercent')}</button
		>
	</div>
	<ul class="group">
		{#each MACRO_KEYS as k (k)}
			<li class="row">
				<label class="grow" for="t-{k}">{t(macroLabel[k])}</label>
				{#if mode === 'pct'}
					<span class="calc">{pct[k] > 0 ? `${fmt(pctGrams[k])} g` : '–'}</span><input
						id="t-{k}"
						type="number"
						inputmode="numeric"
						min="1"
						max="100"
						bind:value={pct[k]}
					/><span class="u">%</span>
				{:else}
					<input id="t-{k}" type="number" inputmode="numeric" min="0" bind:value={grams[k]} /><span
						class="u">g</span
					>
				{/if}
			</li>
		{/each}
	</ul>
	{#if mode === 'pct'}
		<p class="section-footer" class:warn={pctSum !== 100}>
			{pctSum === 100
				? t('targets.pctSum', { sum: fmt(pctSum) })
				: t('targets.pctSumOff', { sum: fmt(pctSum) })}
		</p>
	{:else}
		<p class="section-footer" class:warn={Math.abs(macroKcal - kcal) > kcal * 0.1}>
			{t('targets.macroCheck', { kcal: `${fmt(macroKcal)} kcal` })}
		</p>
	{/if}

	<h2 class="section-header">{t('targets.extra')}</h2>
	{#if extra.length}
		<ul class="group">
			{#each extra as e, i (e.key)}
				<li class="row extra">
					<span class="grow">{t(`nutrient.${e.key}`)}</span>
					<input
						type="number"
						inputmode="decimal"
						placeholder={t('targets.min')}
						bind:value={e.min}
						aria-label="{t(`nutrient.${e.key}`)} {t('targets.min')}"
					/>
					<input
						type="number"
						inputmode="decimal"
						placeholder={t('targets.max')}
						bind:value={e.max}
						aria-label="{t(`nutrient.${e.key}`)} {t('targets.max')}"
					/>
					<span class="u">{NUTRIENTS[e.key].unit}</span>
					<button
						class="del"
						onclick={() => (extra = extra.filter((_, j) => j !== i))}
						aria-label={t('app.delete')}>×</button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="add-extra">
		<select bind:value={addKey} aria-label={t('targets.addExtra')}>
			<option value="">{t('targets.addExtra')} …</option>
			{#each available as k (k)}<option value={k}>{t(`nutrient.${k}`)}</option>{/each}
		</select>
		<button class="btn small secondary" onclick={addExtra} disabled={!addKey}>{t('app.add')}</button
		>
	</div>
	<p class="section-footer">{t('targets.extraHint')}</p>

	<div style="margin-top: 28px">
		<button class="btn" onclick={save} data-testid="save-targets">{t('app.save')}</button>
	</div>
</main>

<style>
	.u {
		color: var(--label-2);
		width: 34px;
		flex: none;
	}
	.row input {
		max-width: 90px;
	}
	.mode {
		margin: 0 0 10px;
	}
	.calc {
		color: var(--label-2);
		font-variant-numeric: tabular-nums;
		margin-right: 12px;
	}
	.extra input {
		max-width: 72px;
		background: var(--fill) !important;
		border-radius: 8px;
		padding: 4px 6px !important;
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger-text);
		font-size: 22px;
		width: 32px;
	}
	.add-extra {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.add-extra select {
		flex: 1;
		min-height: 36px;
		border-radius: 10px;
		border: 0;
		background: var(--bg-elev);
		padding: 0 10px;
	}
</style>
