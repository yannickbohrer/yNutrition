<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import TabBar from '#lib/components/TabBar.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import AddSheet from '#lib/components/AddSheet.svelte';
	import PortionPicker from '#lib/components/PortionPicker.svelte';
	import { app } from '#lib/stores/app.svelte.ts';
	import { setLang, i18n } from '#lib/i18n/index.svelte.ts';
	import { todayLocal } from '#lib/dates.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	function sync() {
		app.settings = data.settings;
		app.today = data.today;
		app.usdaEnabled = data.usdaEnabled;
		app.swissVersion = data.swissVersion;
		if (i18n.lang !== data.settings.lang) setLang(data.settings.lang);
	}
	// synchronously for SSR (effects don't run on the server), and reactively on the client
	sync();
	$effect.pre(sync);

	const bare = $derived(/^\/(login|setup)/.test(page.url.pathname) || !data.authed);

	onMount(() => {
		// keep "today" correct when the app stays open past midnight / is resumed
		const tick = () => (app.today = todayLocal());
		const id = setInterval(tick, 60_000);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', tick);
		};
	});
</script>

<svelte:head>
	<title>Nutrition</title>
</svelte:head>

<input class="focus-proxy" id="focus-proxy" aria-hidden="true" tabindex="-1" />

<div class="app-shell" class:with-nav={!bare}>
	{@render children()}
</div>

{#if !bare}
	<TabBar />
	<AddSheet />
	<PortionPicker />
{/if}
<Toasts />
