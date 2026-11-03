<script lang="ts">
	import { page } from '$app/state';
	import AddPanel from '#lib/components/AddPanel.svelte';
	import { logFood } from '#lib/logging.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { isDate } from '#lib/dates.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { FoodDTO, FoodSummary } from '#lib/types.ts';

	const date = $derived.by(() => {
		const d = page.url.searchParams.get('date');
		return isDate(d) ? d : app.today;
	});

	async function select(f: FoodSummary | FoodDTO) {
		await logFood('portions' in f ? f : f.id, date);
	}
</script>

<svelte:head><title>{t('add.title')} · Nutrition</title></svelte:head>

<main class="page">
	<h1 class="large-title">{t('add.title')}</h1>
	<AddPanel onselect={select} />
</main>
