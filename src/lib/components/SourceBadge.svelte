<script lang="ts">
	import type { FoodSourceId } from '#lib/types.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	let { source }: { source: FoodSourceId | null } = $props();
</script>

{#if source}
	<span class="pill src-{source}" title={t(`source.${source}Long`)}>{t(`source.${source}`)}</span>
{/if}

<style>
	.src-swissfcd {
		background: color-mix(in srgb, #ff3b30 14%, transparent);
		color: #b0000f;
	}
	.src-off {
		background: color-mix(in srgb, #ff9500 16%, transparent);
		color: #7f4400;
	}
	.src-usda {
		background: color-mix(in srgb, #5856d6 16%, transparent);
		color: #2e2c8f;
	}
	.src-custom {
		background: color-mix(in srgb, #34c759 16%, transparent);
		color: #18652b;
	}
	.src-recipe {
		background: color-mix(in srgb, #007aff 14%, transparent);
		color: #004a9c;
	}
	@media (prefers-color-scheme: dark) {
		.src-swissfcd {
			color: #ff6961;
		}
		.src-off {
			color: #ffb340;
		}
		.src-usda {
			color: #a5a3ff;
		}
		.src-custom {
			color: #4cd964;
		}
		.src-recipe {
			color: #64a8ff;
		}
	}
</style>
