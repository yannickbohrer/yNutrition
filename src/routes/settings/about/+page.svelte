<script lang="ts">
	import BackNav from '#lib/components/BackNav.svelte';
	import { app } from '#lib/stores/app.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
</script>

<svelte:head><title>{t('about.title')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/settings" label={t('settings.title')} />
	<h1 class="large-title">{t('about.title')}</h1>
	<p class="hint lead">{t('about.description')}</p>

	<h2 class="section-header">{t('about.sources')}</h2>
	<div class="group card" data-testid="credits">
		<section>
			<h3>{t('about.swissfcd')}</h3>
			<p>{t('about.swissfcdText', { version: app.swissVersion || '–' })}</p>
			<a href="https://naehrwertdaten.ch/" target="_blank" rel="noopener">naehrwertdaten.ch</a>
		</section>
		<section>
			<h3>{t('about.off')}</h3>
			<p>{t('about.offText')}</p>
			<a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">openfoodfacts.org</a
			>
			·
			<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener"
				>ODbL 1.0</a
			>
			·
			<a href="https://opendatacommons.org/licenses/dbcl/1-0/" target="_blank" rel="noopener"
				>DbCL 1.0</a
			>
		</section>
		<section>
			<h3>{t('about.usda')}</h3>
			<p>{t('about.usdaText')}</p>
			{#if !app.usdaEnabled}<p class="hint">{t('about.usdaDisabled')}</p>{/if}
			<a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener">fdc.nal.usda.gov</a>
		</section>
		<section>
			<h3>{t('about.portions')}</h3>
			<p>{t('about.portionsText')}</p>
		</section>
		<section>
			<h3>{t('about.software')}</h3>
			<p>{t('about.softwareText')}</p>
			<a href="/third-party-licenses.txt" target="_blank" rel="noopener"
				>{t('about.thirdPartyLicenses')}</a
			>
		</section>
	</div>
	<p class="section-footer">{t('about.disclaimer')}</p>
</main>

<style>
	.lead {
		margin: 0 4px;
		font-size: 15px;
	}
	.card section {
		padding: 14px 16px;
		border-bottom: 0.5px solid var(--sep);
	}
	.card section:last-child {
		border-bottom: 0;
	}
	h3 {
		margin: 0 0 4px;
		font-size: 16px;
	}
	p {
		margin: 0 0 6px;
		font-size: 14px;
		color: var(--label-2);
		line-height: 1.4;
	}
	a {
		font-size: 14px;
	}
</style>
