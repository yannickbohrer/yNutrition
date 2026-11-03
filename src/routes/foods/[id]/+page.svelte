<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BackNav from '#lib/components/BackNav.svelte';
	import CustomFoodForm, { type CustomFoodPayload } from '#lib/components/CustomFoodForm.svelte';
	import NutrientTable from '#lib/components/NutrientTable.svelte';
	import SourceBadge from '#lib/components/SourceBadge.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api } from '#lib/api.ts';
	import { logFood } from '#lib/logging.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const food = $derived(data.food);
	let editing = $state(false);
	let favorite = $derived(data.food.favorite);

	async function toggleFav() {
		favorite = !favorite;
		await api.favorite(food.id, favorite);
	}

	async function save(p: CustomFoodPayload) {
		await api.updateFood(food.id, p);
		editing = false;
		toast(t('app.saved'));
		await invalidateAll();
	}

	async function remove() {
		if (!confirm(t('custom.deleteConfirm', { name: food.name }))) return;
		await api.deleteFood(food.id);
		toast(t('app.deleted'));
		goto('/add');
	}

	async function delPortion(pid: number) {
		await api.deletePortion(food.id, pid);
		await invalidateAll();
	}

	const attribution = $derived(
		food.source === 'off'
			? t('food.offAttribution')
			: food.source === 'usda'
				? t('food.usdaAttribution')
				: food.source === 'swissfcd'
					? t('food.swissAttribution')
					: null
	);
</script>

<svelte:head><title>{food.name} · Nutrition</title></svelte:head>

<main class="page" class:food-page={!editing}>
	<BackNav
		href={food.source === 'recipe' ? '/recipes' : '/add'}
		label={food.source === 'recipe' ? t('recipe.listTitle') : t('add.title')}
	>
		{#snippet right()}
			{#if food.source === 'custom' && !food.deleted}
				<button class="nav-btn" onclick={() => (editing = !editing)} data-testid="edit-food"
					>{editing ? t('app.cancel') : t('app.edit')}</button
				>
			{:else if food.source === 'recipe'}
				<a class="nav-btn" href="/recipes/{food.id}">{t('app.edit')}</a>
			{/if}
		{/snippet}
	</BackNav>

	{#if editing}
		<h1 class="large-title">{t('custom.editTitle')}</h1>
		<CustomFoodForm initial={food} onsubmit={save} submitLabel={t('app.save')} />
		<div style="margin-top:12px">
			<button class="btn danger" onclick={remove}>{t('app.delete')}</button>
		</div>
	{:else}
		<div class="food-cols">
			<div>
				<h1 class="title">{food.name}</h1>
				<div class="meta">
					<SourceBadge source={food.source} />
					{#if food.brand}<span>{food.brand}</span>{/if}
					{#if food.barcode}<span class="tabular">· {food.barcode}</span>{/if}
				</div>
				{#if food.deleted}<p class="warn">{t('food.deleted')}</p>{/if}

				<div class="actions">
					<button
						class="btn"
						onclick={() => logFood(food, app.today)}
						disabled={food.deleted}
						data-testid="log-food">{t('food.log')}</button
					>
					<button
						class="btn secondary fav"
						onclick={toggleFav}
						aria-pressed={favorite}
						aria-label={favorite ? t('food.unfavorite') : t('food.favorite')}
						data-testid="food-favorite"
					>
						<Icon name="star" fill={favorite} size={20} />
						{t('a11y.favorite')}
					</button>
				</div>

				{#if food.incomplete}
					<p class="hint warn"><Icon name="warn" size={14} /> {t('food.incompleteHint')}</p>
				{/if}

				<h2 class="section-header">{t('food.portions')}</h2>
				<ul class="group">
					{#each food.portions as p (p.amount)}
						<li class="row">
							<span class="grow">{p.label}</span>
							<span class="secondary tabular">{fmt(p.amount, 1)} {food.basis}</span>
							{#if p.kind === 'user' && p.id}
								<button class="del" onclick={() => delPortion(p.id!)} aria-label={t('app.delete')}
									>×</button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
			<div class="food-right">
				<h2 class="section-header">{t('food.per100', { unit: food.basis })}</h2>
				<NutrientTable
					nutrients={food.nutrients}
					partial={food.partial}
					showUnknown={food.source !== 'swissfcd'}
				/>

				{#if attribution}
					<p class="section-footer attribution">
						{attribution}
						{#if food.sourceUrl}<a
								href={food.sourceUrl}
								target="_blank"
								rel="noopener"
								data-testid="source-link">{t('food.viewSource')} ↗</a
							>{/if}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	.title {
		font-size: 28px;
		line-height: 1.2;
		margin: 6px 0 4px;
	}
	.meta {
		display: flex;
		gap: 6px;
		align-items: center;
		color: var(--label-2);
		font-size: 15px;
		flex-wrap: wrap;
	}
	.actions {
		display: flex;
		gap: 10px;
		margin: 18px 0 8px;
	}
	.actions .btn {
		flex: 1;
	}
	.actions .fav {
		flex: none;
		width: auto;
	}
	.fav[aria-pressed='true'] {
		color: #c79a00;
	}
	.del {
		border: 0;
		background: none;
		color: var(--danger-text);
		font-size: 22px;
		width: 32px;
	}
	.attribution {
		margin-top: 16px;
	}
	.hint.warn {
		display: flex;
		gap: 4px;
		align-items: flex-start;
	}

	/* ---------- desktop: food | nutrients ---------- */
	@media (min-width: 1400px) and (orientation: landscape) {
		.food-page {
			--page-max: 1240px;
		}
		.food-cols {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0 28px;
			align-items: start;
		}
		.food-right > :global(.section-header:first-child) {
			margin-top: 6px;
		}
	}
</style>
