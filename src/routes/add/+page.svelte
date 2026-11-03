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

<main class="page add-page">
	<h1 class="large-title">{t('add.title')}</h1>
	<AddPanel onselect={select} />
</main>

<style>
	/* ---------- desktop: suggestions side by side ---------- */
	@media (min-width: 1400px) and (orientation: landscape) {
		.add-page {
			--page-max: 1240px;
		}
		.add-page :global(.add-cols) {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0 24px;
			align-items: start;
		}
	}
</style>
