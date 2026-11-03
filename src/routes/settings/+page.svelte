<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SettingsNav from '#lib/components/SettingsNav.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { viewport } from '#lib/stores/viewport.svelte.ts';
	import { setLang, t } from '#lib/i18n/index.svelte.ts';
	import type { UserSettings } from '#lib/types.ts';

	async function update(patch: Partial<UserSettings>) {
		app.settings = { ...app.settings, ...patch };
		if (patch.lang) setLang(patch.lang);
		await api.settings(patch);
		await invalidateAll();
	}
</script>

<svelte:head><title>{t('settings.title')} · Nutrition</title></svelte:head>

<main class="page">
	{#if viewport.wide}
		<!-- split view: the section list (with the page title) is in the left column -->
		<div class="nav-row" aria-hidden="true"></div>
		<h2 class="large-title">{t('settings.general')}</h2>
	{:else}
		<h1 class="large-title">{t('settings.title')}</h1>
		<h2 class="section-header">{t('settings.general')}</h2>
	{/if}
	<ul class="group">
		<li class="row">
			<span class="grow">{t('settings.language')}</span>
			<div class="segmented seg" role="group" aria-label={t('settings.language')}>
				<button
					aria-pressed={app.settings.lang === 'de'}
					onclick={() => update({ lang: 'de' })}
					data-testid="lang-de">{t('settings.languageDe')}</button
				>
				<button
					aria-pressed={app.settings.lang === 'en'}
					onclick={() => update({ lang: 'en' })}
					data-testid="lang-en">{t('settings.languageEn')}</button
				>
			</div>
		</li>
		<li class="row">
			<span class="grow">{t('settings.energyUnit')}</span>
			<div class="segmented seg" role="group" aria-label={t('settings.energyUnit')}>
				<button
					aria-pressed={app.settings.energyUnit === 'kcal'}
					onclick={() => update({ energyUnit: 'kcal' })}>kcal</button
				>
				<button
					aria-pressed={app.settings.energyUnit === 'kJ'}
					onclick={() => update({ energyUnit: 'kJ' })}>kJ</button
				>
			</div>
		</li>
		{#if app.settings.energyUnit === 'kcal'}
			<li class="row">
				<label class="grow" for="showkj">{t('settings.showKj')}</label>
				<input
					id="showkj"
					class="switch"
					type="checkbox"
					checked={app.settings.showKj}
					onchange={(e) => update({ showKj: e.currentTarget.checked })}
				/>
			</li>
		{/if}
	</ul>

	{#if !viewport.wide}
		<SettingsNav />
	{/if}
</main>

<style>
	.seg {
		width: 170px;
		flex: none;
	}
</style>
