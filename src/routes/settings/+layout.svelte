<script lang="ts">
	/** iPad landscape: settings as a split view (section list | section). Elsewhere a no-op. */
	import SettingsNav from '#lib/components/SettingsNav.svelte';
	import { viewport } from '#lib/stores/viewport.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';

	let { children } = $props();
</script>

<div class="settings-shell" class:split={viewport.wide}>
	{#if viewport.wide}
		<aside class="settings-side" aria-label={t('settings.title')}>
			<h1 class="large-title">{t('settings.title')}</h1>
			<SettingsNav split />
		</aside>
	{/if}
	<div class="settings-main">
		{@render children()}
	</div>
</div>

<style>
	@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape),
		(min-width: 1000px) and (orientation: landscape) {
		.settings-shell.split {
			display: grid;
			grid-template-columns: 300px minmax(0, 1fr);
			max-width: 1240px;
			margin: 0 auto;
		}
		.settings-side {
			position: sticky;
			top: 0;
			align-self: start;
			max-height: 100dvh;
			overflow-y: auto;
			padding: calc(var(--safe-top) + 8px) 0 32px var(--gutter);
		}
		.settings-side .large-title {
			margin-top: 50px; /* level with the detail title (below its nav row) */
		}
		/* the list is always visible, so detail pages don't need a back button */
		.split .settings-main :global(.back-nav) {
			visibility: hidden;
		}
	}
</style>
