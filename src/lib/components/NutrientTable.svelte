<script lang="ts">
	/** Grouped nutrient list. Unknown values show "–" (never 0); partial values get a marker. */
	import {
		GROUP_ORDER,
		NUTRIENTS,
		NUTRIENT_KEYS,
		type NutrientKey,
		type Nutrients
	} from '#lib/nutrients.ts';
	import { fmt, fmtAmount, t } from '#lib/i18n/index.svelte.ts';
	import type { NutrientTarget } from '#lib/types.ts';

	let {
		nutrients,
		partial = [],
		missing,
		count = 0,
		showUnknown = false,
		keys,
		targets
	}: {
		nutrients: Nutrients;
		partial?: NutrientKey[];
		/** per-key count of entries lacking data (day totals) */
		missing?: Partial<Record<NutrientKey, number>>;
		count?: number;
		showUnknown?: boolean;
		keys?: NutrientKey[];
		/** optional goals (min) / limits (max) to compare against (day totals) */
		targets?: Partial<Record<NutrientKey, NutrientTarget>>;
	} = $props();

	const list = $derived(
		(keys ?? NUTRIENT_KEYS.filter((k) => k !== 'energy_kj')).filter(
			(k) => showUnknown || nutrients[k] !== undefined || !!targets?.[k]
		)
	);
	const groups = $derived(
		GROUP_ORDER.map((g) => ({ g, keys: list.filter((k) => NUTRIENTS[k].group === g) })).filter(
			(x) => x.keys.length
		)
	);
	const isPartial = (k: NutrientKey) =>
		partial.includes(k) ||
		(missing && count > 0 && (missing[k] ?? 0) > 0 && nutrients[k] !== undefined);
</script>

{#each groups as { g, keys: ks } (g)}
	<h3 class="section-header">{t(`nutrientGroup.${g}`)}</h3>
	<ul class="group">
		{#each ks as k (k)}
			{@const def = NUTRIENTS[k]}
			{@const v = nutrients[k]}
			<li class="row nrow" class:sub={def.sub}>
				<span class="grow">{t(`nutrient.${k}`)}</span>
				<span class="val tabular" class:unknown={v === undefined}>
					{#if v === undefined}
						{t('picker.missingData')}
					{:else}
						{#if isPartial(k)}<span class="partial" title={t('day.incomplete')}>≥</span>{/if}
						{def.unit === 'kcal' || def.unit === 'kJ' ? fmt(v) : fmtAmount(v)}
						{def.unit}
					{/if}
					{#if targets?.[k]}
						{@const tg = targets[k]!}
						{@const cur = v ?? 0}
						<span
							class="target"
							class:bad={(tg.max != null && cur > tg.max) || (tg.min != null && cur < tg.min)}
							class:good={tg.min != null && cur >= tg.min && (tg.max == null || cur <= tg.max)}
						>
							{tg.max != null ? `/ ≤ ${fmtAmount(tg.max)}` : `/ ≥ ${fmtAmount(tg.min)}`}
						</span>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
{/each}

<style>
	.nrow {
		font-size: 15px;
		min-height: 40px;
		padding-top: 8px;
		padding-bottom: 8px;
	}
	.nrow.sub .grow {
		padding-left: 14px;
		color: var(--label-2);
	}
	.val {
		color: var(--label-2);
		white-space: nowrap;
	}
	.val.unknown {
		color: var(--label-3);
		font-size: 13px;
	}
	.target {
		font-size: 13px;
		margin-left: 4px;
		color: var(--label-2);
	}
	.target.bad {
		color: var(--over-text);
		font-weight: 600;
	}
	.target.good {
		color: var(--success);
	}
	.partial {
		color: var(--warning);
		margin-right: 2px;
	}
</style>
