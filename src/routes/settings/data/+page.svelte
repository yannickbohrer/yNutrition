<script lang="ts">
	import BackNav from '#lib/components/BackNav.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api } from '#lib/api.ts';
	import { bumpData, toast } from '#lib/stores/ui.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { invalidateAll } from '$app/navigation';

	let fileEl: HTMLInputElement | undefined = $state();
	let busy = $state(false);

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!confirm(t('data.importConfirm'))) {
			fileEl!.value = '';
			return;
		}
		busy = true;
		try {
			const data = JSON.parse(await file.text());
			const r = await api.importBackup(data);
			toast(t('data.importDone', { entries: r.entries, weights: r.weights }));
			bumpData();
			await invalidateAll();
		} catch (err) {
			toast(t('data.importError', { msg: err instanceof Error ? err.message : String(err) }), {
				timeout: 5000
			});
		} finally {
			busy = false;
			fileEl!.value = '';
		}
	}
</script>

<svelte:head><title>{t('data.title')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/settings" label={t('settings.title')} />
	<h1 class="large-title">{t('data.title')}</h1>

	<h2 class="section-header">{t('data.export')}</h2>
	<ul class="group">
		<li>
			<a class="row" href="/api/export.json" download data-testid="export-json"
				><Icon name="download" /><span class="grow">{t('data.exportJson')}</span></a
			>
		</li>
		<li>
			<a class="row" href="/api/export/entries.csv" download data-testid="export-entries-csv"
				><Icon name="download" /><span class="grow">{t('data.exportEntriesCsv')}</span></a
			>
		</li>
		<li>
			<a class="row" href="/api/export/weights.csv" download
				><Icon name="download" /><span class="grow">{t('data.exportWeightsCsv')}</span></a
			>
		</li>
	</ul>

	<h2 class="section-header">{t('data.import')}</h2>
	<ul class="group">
		<li>
			<label class="row imp">
				<Icon name="upload" />
				<span class="grow">{t('data.importJson')}</span>
				<input
					bind:this={fileEl}
					type="file"
					accept="application/json,.json"
					onchange={onFile}
					disabled={busy}
					data-testid="import-file"
				/>
			</label>
		</li>
	</ul>
	<p class="section-footer warn">{t('data.importWarning')}</p>
</main>

<style>
	.group .row {
		color: var(--tint);
	}
	.imp {
		cursor: pointer;
	}
	.imp input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
</style>
