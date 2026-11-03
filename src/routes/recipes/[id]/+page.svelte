<script lang="ts">
	import RecipeEditor from '#lib/components/RecipeEditor.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head
	><title>{data.recipe ? data.recipe.name : t('recipe.newTitle')} · Nutrition</title></svelte:head
>

{#key data.recipe?.id ?? 'new'}
	<RecipeEditor recipe={data.recipe} />
{/key}
