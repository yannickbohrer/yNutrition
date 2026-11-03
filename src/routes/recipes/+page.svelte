<script lang="ts">
	import BackNav from '#lib/components/BackNav.svelte';
	import FoodRow from '#lib/components/FoodRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>{t('recipe.listTitle')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/add" label={t('add.title')}>
		{#snippet right()}<a class="nav-btn" href="/recipes/new" data-testid="new-recipe"
				><Icon name="plus" /> {t('recipe.newTitle')}</a
			>{/snippet}
	</BackNav>
	<h1 class="large-title">{t('recipe.listTitle')}</h1>
	{#if data.recipes.length}
		<div class="group" data-testid="recipe-list">
			{#each data.recipes as r (r.id)}<FoodRow
					food={r}
					onselect={(f) => goto(`/foods/${f.id}`)}
				/>{/each}
		</div>
	{:else}
		<p class="empty">{t('recipe.empty')}</p>
	{/if}

	{#if data.custom.length}
		<h2 class="section-header">{t('source.customLong')}</h2>
		<div class="group">
			{#each data.custom as f (f.id)}<FoodRow
					food={f}
					onselect={(x) => goto(`/foods/${x.id}`)}
				/>{/each}
		</div>
	{/if}
</main>
