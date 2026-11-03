<script lang="ts">
	import Sheet from './Sheet.svelte';
	import AddPanel from './AddPanel.svelte';
	import { addSheet } from '#lib/stores/ui.svelte.ts';
	import { logFood } from '#lib/logging.ts';
	import { fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import type { FoodDTO, FoodSummary } from '#lib/types.ts';

	const date = $derived(addSheet.date ?? app.today);
	const title = $derived(
		date === app.today
			? t('add.title')
			: t('add.addTo', { date: fmtDate(date, { day: 'numeric', month: 'short' }) })
	);

	async function select(f: FoodSummary | FoodDTO) {
		// stay open after logging so several foods can be added in a row
		await logFood('portions' in f ? f : f.id, date);
	}
</script>

<Sheet open={addSheet.open} onclose={() => (addSheet.open = false)} label={title} height="full">
	{#snippet header()}
		<div class="nav-row">
			<h2 class="sheet-title">{title}</h2>
			<button class="nav-btn" onclick={() => (addSheet.open = false)} data-testid="add-sheet-done"
				>{t('app.done')}</button
			>
		</div>
	{/snippet}
	{#if addSheet.open}
		<AddPanel onselect={select} autofocus inputId="sheet-search" />
	{/if}
</Sheet>

<style>
	.sheet-title {
		font-size: 17px;
		font-weight: 600;
		margin: 0;
	}
</style>
