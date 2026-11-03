<script lang="ts">
	import type { FoodSummary } from '#lib/types.ts';
	import SourceBadge from './SourceBadge.svelte';
	import Icon from './Icon.svelte';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { KJ_PER_KCAL } from '#lib/nutrition.ts';

	let { food, onselect }: { food: FoodSummary; onselect: (f: FoodSummary) => void } = $props();
	const unit = $derived(app.settings.energyUnit);
	const energy = $derived(
		food.kcal === null ? null : unit === 'kJ' ? food.kcal * KJ_PER_KCAL : food.kcal
	);
</script>

<button class="row food-row" onclick={() => onselect(food)} data-testid="food-row">
	<div class="grow">
		<div class="row-title">
			{#if food.favorite}<span class="fav"
					><Icon name="star" fill size={13} label={t('a11y.favorite')} /></span
				>{/if}
			{food.name}
		</div>
		<div class="row-sub">
			<SourceBadge source={food.source} />
			{#if food.brand}<span>{food.brand}</span>{/if}
			{#if food.incomplete}<span class="warn">· {t('add.incomplete')}</span>{/if}
		</div>
	</div>
	<div class="kcal tabular">
		{#if energy !== null}
			<strong>{fmt(energy)}</strong>
			<span>{unit}{t('add.per100', { unit: food.basis })}</span>
		{:else}
			<span>–</span>
		{/if}
	</div>
</button>

<style>
	.food-row {
		min-height: 56px;
	}
	.row-sub {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fav {
		color: #ffcc00;
		margin-right: 2px;
		vertical-align: -1px;
	}
	.kcal {
		text-align: right;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-size: 15px;
	}
	.kcal span {
		font-size: 11px;
		color: var(--label-2);
	}
</style>
