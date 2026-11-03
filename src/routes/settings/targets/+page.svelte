<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import BackNav from '#lib/components/BackNav.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import { NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import type { NutrientTarget } from '#lib/types.ts';

	const cur = app.settings.targets;
	let kcal = $state(cur.energy_kcal);
	let protein = $state(cur.protein);
	let carbs = $state(cur.carbs);
	let fat = $state(cur.fat);
	let extra = $state<{ key: NutrientKey; min: number | null; max: number | null }[]>(
		Object.entries(cur.extra).map(([k, v]) => ({
			key: k as NutrientKey,
			min: (v as NutrientTarget).min ?? null,
			max: (v as NutrientTarget).max ?? null
		}))
	);
	let addKey = $state<NutrientKey | ''>('');

	const macroKcal = $derived((protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9);
	const available = $derived(
		NUTRIENT_KEYS.filter(
			(k) =>
				!['energy_kcal', 'energy_kj', 'protein', 'carbs', 'fat'].includes(k) &&
				!extra.some((e) => e.key === k)
		)
	);

	function addExtra() {
		if (!addKey) return;
		extra = [...extra, { key: addKey, min: null, max: null }];
		addKey = '';
	}

	async function save() {
		const ex: Record<string, NutrientTarget> = {};
		for (const e of extra)
			if (e.min || e.max) ex[e.key] = { min: e.min || null, max: e.max || null };
		const s = await api.settings({
			targets: { energy_kcal: kcal, protein, carbs, fat, extra: ex }
		});
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
			<label class="grow" for="t-p">{t('targets.protein')}</label><input
				id="t-p"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={protein}
			/><span class="u">g</span>
		</li>
		<li class="row">
			<label class="grow" for="t-c">{t('targets.carbs')}</label><input
				id="t-c"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={carbs}
			/><span class="u">g</span>
		</li>
		<li class="row">
			<label class="grow" for="t-f">{t('targets.fat')}</label><input
				id="t-f"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={fat}
			/><span class="u">g</span>
		</li>
	</ul>
	<p class="section-footer" class:warn={Math.abs(macroKcal - kcal) > kcal * 0.1}>
		{t('targets.macroCheck', { kcal: `${fmt(macroKcal)} kcal` })}
	</p>

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
