<script lang="ts" module>
	import type { Basis as B } from '#lib/types.ts';
	import type { NutrientKey as NK } from '#lib/nutrients.ts';
	export interface CustomFoodPayload {
		name: string;
		nameEn: string | null;
		brand: string | null;
		barcode: string | null;
		basis: B;
		per: '100' | 'serving';
		servingAmount: number | null;
		servingLabel: string | null;
		nutrients: Partial<Record<NK, number>>;
		portions: { label: string; amount: number }[];
	}
</script>

<script lang="ts">
	import { LABEL_KEYS, NUTRIENTS, NUTRIENT_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { Basis, FoodDTO } from '#lib/types.ts';

	let {
		initial,
		barcode = '',
		onsubmit,
		submitLabel
	}: {
		initial?: FoodDTO | null;
		barcode?: string;
		onsubmit: (p: CustomFoodPayload) => Promise<void>;
		submitLabel: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const init = initial;
	let name = $state(init?.nameDe ?? '');
	let nameEn = $state(init?.nameEn ?? '');
	let brand = $state(init?.brand ?? '');
	// svelte-ignore state_referenced_locally
	let code = $state(init?.barcode ?? barcode);
	let basis = $state<Basis>(init?.basis ?? 'g');
	let per = $state<'100' | 'serving'>('100');
	let servingAmount = $state<number | null>(
		init?.portions.find((p) => p.kind === 'serving')?.amount ?? null
	);
	let servingLabel = $state(init?.servingSize ?? '');
	let values = $state<Record<string, number | null>>(
		Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, init?.nutrients[k] ?? null]))
	);
	let portions = $state<{ label: string; amount: number | null }[]>(
		init?.portions
			.filter((p) => p.kind === 'user')
			.map((p) => ({ label: p.label, amount: p.amount })) ?? []
	);
	let showMore = $state(false);
	let error = $state('');
	let busy = $state(false);

	const extraKeys = NUTRIENT_KEYS.filter((k) => !LABEL_KEYS.includes(k) && k !== 'energy_kj');

	async function submit(e: Event) {
		e.preventDefault();
		error = '';
		if (!name.trim()) return (error = t('custom.nameRequired'));
		if (
			values.energy_kcal === null ||
			values.energy_kcal === undefined ||
			String(values.energy_kcal) === ''
		)
			return (error = t('custom.kcalRequired'));
		const nutrients: Partial<Record<NutrientKey, number>> = {};
		for (const [k, v] of Object.entries(values))
			if (v !== null && v !== undefined && String(v) !== '' && Number.isFinite(Number(v)))
				nutrients[k as NutrientKey] = Number(v);
		busy = true;
		try {
			await onsubmit({
				name: name.trim(),
				nameEn: nameEn.trim() || null,
				brand: brand.trim() || null,
				barcode: code.trim() || null,
				basis,
				per,
				servingAmount: servingAmount ? Number(servingAmount) : null,
				servingLabel: servingLabel.trim() || null,
				nutrients,
				portions: portions
					.filter((p) => p.label.trim() && p.amount && p.amount > 0)
					.map((p) => ({ label: p.label.trim(), amount: Number(p.amount) }))
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} novalidate data-testid="custom-food-form">
	<ul class="group">
		<li class="row">
			<label for="cf-name">{t('custom.name')}</label><input
				id="cf-name"
				bind:value={name}
				required
				autocomplete="off"
				data-testid="cf-name"
			/>
		</li>
		<li class="row">
			<label for="cf-name-en">{t('custom.nameEn')}</label><input
				id="cf-name-en"
				bind:value={nameEn}
				placeholder={t('app.optional')}
				autocomplete="off"
			/>
		</li>
		<li class="row">
			<label for="cf-brand">{t('custom.brand')}</label><input
				id="cf-brand"
				bind:value={brand}
				placeholder={t('app.optional')}
				autocomplete="off"
			/>
		</li>
		<li class="row">
			<label for="cf-barcode">{t('custom.barcode')}</label><input
				id="cf-barcode"
				bind:value={code}
				inputmode="numeric"
				placeholder={t('app.optional')}
				data-testid="cf-barcode"
			/>
		</li>
	</ul>

	<h2 class="section-header">{t('custom.unit')}</h2>
	<div class="segmented">
		<button type="button" aria-pressed={basis === 'g'} onclick={() => (basis = 'g')}
			>{t('custom.grams')}</button
		>
		<button type="button" aria-pressed={basis === 'ml'} onclick={() => (basis = 'ml')}
			>{t('custom.millilitres')}</button
		>
	</div>

	<h2 class="section-header">{t('custom.valuesPer')}</h2>
	<div class="segmented">
		<button type="button" aria-pressed={per === '100'} onclick={() => (per = '100')}
			>{t('custom.per100', { unit: basis })}</button
		>
		<button
			type="button"
			aria-pressed={per === 'serving'}
			onclick={() => (per = 'serving')}
			data-testid="cf-per-serving">{t('custom.perServing')}</button
		>
	</div>
	<ul class="group spaced">
		<li class="row">
			<label for="cf-sa">{t('custom.servingAmount')}</label><input
				id="cf-sa"
				type="number"
				inputmode="decimal"
				bind:value={servingAmount}
				placeholder={per === 'serving' ? '' : t('app.optional')}
				data-testid="cf-serving-amount"
			/><span class="u">{basis}</span>
		</li>
		<li class="row">
			<label for="cf-sl">{t('custom.servingLabel')}</label><input
				id="cf-sl"
				bind:value={servingLabel}
				placeholder={t('custom.servingLabelPlaceholder')}
			/>
		</li>
	</ul>

	<h2 class="section-header">{t('custom.nutrients')}</h2>
	<ul class="group">
		{#each LABEL_KEYS as k (k)}
			<li class="row" class:sub={NUTRIENTS[k].sub}>
				<label for="cf-{k}">{t(`nutrient.${k}`)}</label>
				<input
					id="cf-{k}"
					type="number"
					inputmode="decimal"
					step="any"
					min="0"
					bind:value={values[k]}
					data-testid="cf-{k}"
				/>
				<span class="u">{NUTRIENTS[k].unit}</span>
			</li>
		{/each}
	</ul>
	<button type="button" class="more" onclick={() => (showMore = !showMore)} aria-expanded={showMore}
		>{t('custom.moreNutrients')} {showMore ? '▴' : '▾'}</button
	>
	{#if showMore}
		<ul class="group">
			{#each extraKeys as k (k)}
				<li class="row" class:sub={NUTRIENTS[k].sub}>
					<label for="cf-{k}">{t(`nutrient.${k}`)}</label>
					<input
						id="cf-{k}"
						type="number"
						inputmode="decimal"
						step="any"
						min="0"
						bind:value={values[k]}
					/>
					<span class="u">{NUTRIENTS[k].unit}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="section-header">{t('custom.portions')}</h2>
	{#if portions.length}
		<ul class="group">
			{#each portions as p, i (i)}
				<li class="row">
					<input
						class="pl"
						bind:value={p.label}
						placeholder={t('custom.portionLabel')}
						aria-label={t('custom.portionLabel')}
					/>
					<input
						class="pa"
						type="number"
						inputmode="decimal"
						bind:value={p.amount}
						aria-label={t('custom.portionAmount')}
					/>
					<span class="u">{basis}</span>
					<button
						type="button"
						class="del"
						onclick={() => (portions = portions.filter((_, j) => j !== i))}
						aria-label={t('app.delete')}>×</button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<button
		type="button"
		class="more"
		onclick={() => (portions = [...portions, { label: '', amount: null }])}
		>+ {t('custom.addPortion')}</button
	>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="submit">
		<button class="btn" type="submit" disabled={busy} data-testid="cf-submit">{submitLabel}</button>
	</div>
</form>

<style>
	.row label {
		flex: none;
		min-width: 110px;
	}
	.row.sub label {
		padding-left: 14px;
		color: var(--label-2);
	}
	.u {
		color: var(--label-2);
		width: 34px;
		flex: none;
		font-size: 15px;
	}
	.spaced {
		margin-top: 12px;
	}
	.more {
		background: none;
		border: 0;
		color: var(--tint);
		min-height: 44px;
		font-size: 15px;
		padding: 0 4px;
	}
	.pl {
		text-align: left !important;
	}
	.pa {
		max-width: 80px;
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger-text);
		font-size: 22px;
		width: 32px;
	}
	.error {
		color: var(--danger-text);
		margin: 12px 4px 0;
	}
	.submit {
		margin-top: 24px;
	}
</style>
