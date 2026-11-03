<script lang="ts">
	import { goto } from '$app/navigation';
	import BackNav from '#lib/components/BackNav.svelte';
	import Sheet from '#lib/components/Sheet.svelte';
	import AddPanel from '#lib/components/AddPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api } from '#lib/api.ts';
	import { openPicker, toast } from '#lib/stores/ui.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { logFood } from '#lib/logging.ts';
	import { computeRecipe } from '#lib/nutrition.ts';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import type { Nutrients, NutrientKey } from '#lib/nutrients.ts';
	import type { Basis, FoodDTO, FoodSummary } from '#lib/types.ts';
	import type { RecipeDTO } from '#lib/types.ts';

	let { recipe }: { recipe: RecipeDTO | null } = $props();
	// svelte-ignore state_referenced_locally
	const r = recipe;

	interface Item {
		foodId: number;
		name: string;
		basis: Basis;
		amount: number;
		per100: Nutrients | null;
		partial: NutrientKey[];
	}

	let name = $state(r?.name ?? '');
	let servings = $state<number>(r?.servings ?? 1);
	let cookedWeight = $state<number | null>(r?.cookedWeight ?? null);
	let notes = $state(r?.notes ?? '');
	let items = $state<Item[]>(
		r?.items.map((i) => ({
			foodId: i.foodId,
			name: i.name,
			basis: i.basis,
			amount: i.amount,
			per100: null,
			partial: []
		})) ?? []
	);
	let picking = $state(false);
	let busy = $state(false);
	let error = $state('');

	// load per-100 values of existing ingredients for the live calculation
	$effect(() => {
		for (const it of items) {
			if (it.per100 === null) {
				it.per100 = {};
				api.food(it.foodId).then((f) => {
					it.per100 = f.nutrients;
					it.partial = f.partial;
				});
			}
		}
	});

	const calc = $derived(
		computeRecipe(
			items.map((i) => ({ per100: i.per100 ?? {}, partial: i.partial, grams: i.amount })),
			{ servings, cookedWeight }
		)
	);

	async function addIngredient(f: FoodSummary | FoodDTO) {
		const food = 'portions' in f ? f : await api.food(f.id);
		picking = false;
		const res = await openPicker({ food, date: app.today, mode: 'ingredient' });
		if (!res) return;
		items = [
			...items,
			{
				foodId: food.id,
				name: food.name,
				basis: food.basis,
				amount: res.amount,
				per100: food.nutrients,
				partial: food.partial
			}
		];
	}

	async function editItem(i: number) {
		const it = items[i];
		const food = await api.food(it.foodId);
		const res = await openPicker({ food, amount: it.amount, date: app.today, mode: 'ingredient' });
		if (res) items[i].amount = res.amount;
	}

	async function save() {
		error = '';
		if (!name.trim()) return (error = t('custom.nameRequired'));
		if (!items.length) return (error = t('recipe.noIngredients'));
		busy = true;
		const body = {
			name,
			servings: Number(servings) || 1,
			cookedWeight: cookedWeight ? Number(cookedWeight) : null,
			notes,
			items: items.map((i) => ({ foodId: i.foodId, amount: i.amount }))
		};
		try {
			const saved = r ? await api.updateRecipe(r.id, body) : await api.createRecipe(body);
			toast(t('recipe.saved'));
			goto(`/recipes/${saved.id}`, { replace: true, invalidateAll: true });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!r || !confirm(t('recipe.deleteConfirm', { name: r.name }))) return;
		await api.deleteRecipe(r.id);
		goto('/recipes');
	}

	const kcal = (n: Nutrients) => (n.energy_kcal === undefined ? '–' : fmt(n.energy_kcal));
</script>

<main class="page recipe-page">
	<BackNav href="/recipes" label={t('recipe.listTitle')} />
	<h1 class="large-title">{r ? t('recipe.editTitle') : t('recipe.newTitle')}</h1>
	<div class="r-grid">
		<div class="r-details">
			<ul class="group">
				<li class="row">
					<label for="r-name">{t('recipe.name')}</label><input
						id="r-name"
						bind:value={name}
						data-testid="recipe-name"
					/>
				</li>
				<li class="row">
					<label for="r-serv">{t('recipe.servings')}</label><input
						id="r-serv"
						type="number"
						inputmode="decimal"
						min="1"
						bind:value={servings}
						data-testid="recipe-servings"
					/>
				</li>
				<li class="row">
					<label for="r-cw">{t('recipe.cookedWeight')}</label><input
						id="r-cw"
						type="number"
						inputmode="decimal"
						bind:value={cookedWeight}
						placeholder={t('app.optional')}
					/><span class="u">g</span>
				</li>
			</ul>
			<p class="section-footer">{t('recipe.cookedWeightHint')}</p>
		</div>

		<div class="r-items">
			<h2 class="section-header">{t('recipe.ingredients')}</h2>
			<ul class="group" data-testid="recipe-items">
				{#each items as it, i (i)}
					<li class="row">
						<button class="grow item" onclick={() => editItem(i)}>
							<span class="row-title">{it.name}</span>
							<span class="row-sub tabular"
								>{fmt(it.amount, 1)}
								{it.basis}{it.per100?.energy_kcal !== undefined
									? ` · ${fmt((it.per100.energy_kcal * it.amount) / 100)} kcal`
									: ''}</span
							>
						</button>
						<button
							class="del"
							onclick={() => (items = items.filter((_, j) => j !== i))}
							aria-label={t('app.delete')}>×</button
						>
					</li>
				{:else}
					<li class="row secondary">{t('recipe.noIngredients')}</li>
				{/each}
				<li>
					<button class="row add" onclick={() => (picking = true)} data-testid="add-ingredient"
						><Icon name="plus" /> {t('recipe.addIngredient')}</button
					>
				</li>
			</ul>

			{#if items.length}
				<div class="totals" data-testid="recipe-totals">
					<div>
						<span class="lbl">{t('recipe.total')}</span><strong class="tabular"
							>{kcal(calc.total)} kcal</strong
						><span class="sub tabular">{fmt(calc.finalWeight)} g</span>
					</div>
					<div>
						<span class="lbl">{t('recipe.perServing')}</span><strong
							class="tabular"
							data-testid="per-serving-kcal">{kcal(calc.perServing)} kcal</strong
						><span class="sub tabular">{fmt(calc.servingWeight)} g</span>
					</div>
					<div>
						<span class="lbl">{t('recipe.per100')}</span><strong class="tabular"
							>{kcal(calc.per100)} kcal</strong
						><span class="sub tabular"
							>P {fmt(calc.per100.protein ?? 0, 1)} · KH {fmt(calc.per100.carbs ?? 0, 1)} · F {fmt(
								calc.per100.fat ?? 0,
								1
							)}</span
						>
					</div>
				</div>
				{#if calc.partial.length}
					<p class="section-footer warn">
						{t('recipe.partialHint', {
							list: calc.partial
								.slice(0, 6)
								.map((k) => t(`nutrient.${k}`))
								.join(', ')
						})}
					</p>
				{/if}
			{/if}
		</div>

		<div class="r-extra">
			<h2 class="section-header">{t('recipe.notes')}</h2>
			<textarea class="notes" bind:value={notes} rows="3" aria-label={t('recipe.notes')}></textarea>

			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<div class="buttons">
				<button class="btn" onclick={save} disabled={busy} data-testid="save-recipe"
					>{t('app.save')}</button
				>
				{#if r}
					<button
						class="btn secondary"
						onclick={() => logFood(r.id, app.today)}
						data-testid="log-recipe">{t('recipe.log')}</button
					>
					<button class="btn danger" onclick={remove}>{t('app.delete')}</button>
				{/if}
			</div>
		</div>
	</div>
</main>

<Sheet
	open={picking}
	onclose={() => (picking = false)}
	label={t('recipe.addIngredient')}
	height="full"
>
	{#snippet header()}
		<div class="nav-row">
			<strong>{t('recipe.addIngredient')}</strong><button
				class="nav-btn"
				onclick={() => (picking = false)}>{t('app.cancel')}</button
			>
		</div>
	{/snippet}
	{#if picking}<AddPanel
			onselect={addIngredient}
			autofocus
			showLinks={false}
			inputId="ingredient-search"
		/>{/if}
</Sheet>

<style>
	.row label {
		flex: none;
		min-width: 120px;
	}
	.u {
		color: var(--label-2);
	}
	.item {
		background: none;
		border: 0;
		text-align: left;
		padding: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.add {
		color: var(--tint);
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger-text);
		font-size: 22px;
		width: 32px;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 12px;
	}
	.totals > div {
		background: var(--bg-elev);
		border-radius: var(--radius);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.lbl {
		font-size: 12px;
		color: var(--label-2);
	}
	.sub {
		font-size: 11px;
		color: var(--label-2);
	}
	.notes {
		width: 100%;
		border: 0;
		border-radius: var(--radius);
		background: var(--bg-elev);
		padding: 10px 14px;
		resize: vertical;
	}
	.error {
		color: var(--danger-text);
	}
	.buttons {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 24px;
	}

	/* ---------- desktop: ingredients | details ---------- */
	@media (min-width: 1400px) and (orientation: landscape) {
		.recipe-page {
			--page-max: 1240px;
		}
		.r-grid {
			display: grid;
			grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
			grid-template-rows: auto 1fr;
			grid-template-areas:
				'items details'
				'items extra';
			gap: 0 28px;
			align-items: start;
		}
		.r-details {
			grid-area: details;
		}
		.r-items {
			grid-area: items;
		}
		.r-extra {
			grid-area: extra;
		}
		.r-items > .section-header:first-child {
			margin-top: 0;
		}
	}
</style>
