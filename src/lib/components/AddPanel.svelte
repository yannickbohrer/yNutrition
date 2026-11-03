<script lang="ts">
	/**
	 * Unified food search: favourites/recents first, then local DB (Swiss + cached + custom + recipes),
	 * then online (Open Food Facts / USDA). Online search runs only on explicit action (Enter or button)
	 * to respect Open Food Facts' rule against search-as-you-type; results are cached server-side.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import FoodRow from './FoodRow.svelte';
	import Icon from './Icon.svelte';
	import BarcodeScanner from './BarcodeScanner.svelte';
	import { api, type Suggestions } from '#lib/api.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { addSheet } from '#lib/stores/ui.svelte.ts';
	import type { FoodDTO, FoodSummary, OnlineSearchResult, SearchSections } from '#lib/types.ts';

	let {
		onselect,
		autofocus = false,
		showLinks = true,
		inputId = 'food-search'
	}: {
		onselect: (food: FoodSummary | FoodDTO) => void | Promise<void>;
		autofocus?: boolean;
		showLinks?: boolean;
		inputId?: string;
	} = $props();

	let q = $state('');
	let local = $state<SearchSections | null>(null);
	let online = $state<OnlineSearchResult | null>(null);
	let onlineLoading = $state(false);
	let suggestions = $state<Suggestions | null>(null);
	let scanning = $state(false);
	let barcodeState = $state<{
		code: string;
		status: 'loading' | 'notfound' | 'limited' | 'error';
	} | null>(null);
	let inputEl: HTMLInputElement | undefined = $state();

	let timer: ReturnType<typeof setTimeout> | undefined;
	let ctrl: AbortController | undefined;

	onMount(() => {
		loadSuggestions();
		if (autofocus) inputEl?.focus();
	});

	export function focus() {
		inputEl?.focus();
	}

	async function loadSuggestions() {
		try {
			suggestions = await api.suggestions();
		} catch {
			/* ignore */
		}
	}

	function onInput() {
		online = null;
		clearTimeout(timer);
		const query = q.trim();
		if (!query) {
			local = null;
			return;
		}
		timer = setTimeout(() => runLocal(query), 150);
	}

	async function runLocal(query: string) {
		ctrl?.abort();
		ctrl = new AbortController();
		try {
			local = await api.search(query, ctrl.signal);
		} catch (e) {
			if ((e as Error).name !== 'AbortError') local = { query, mine: [], local: [] };
		}
	}

	async function runOnline() {
		const query = q.trim();
		if (query.length < 2 || onlineLoading) return;
		onlineLoading = true;
		try {
			online = await api.online(query);
		} catch {
			online = { query, results: [], sources: [], cached: false, error: 'unavailable' };
		} finally {
			onlineLoading = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			clearTimeout(timer);
			runLocal(q.trim());
			runOnline();
			inputEl?.blur();
		}
	}

	async function onBarcode(code: string) {
		scanning = false;
		barcodeState = { code, status: 'loading' };
		try {
			const r = await api.barcode(code);
			if (r.food) {
				barcodeState = null;
				await onselect(r.food);
			} else
				barcodeState = { code, status: r.limited ? 'limited' : r.error ? 'error' : 'notfound' };
		} catch {
			barcodeState = { code, status: 'error' };
		}
	}

	function createWithBarcode(code: string) {
		addSheet.open = false;
		goto(`/foods/new?barcode=${encodeURIComponent(code)}`);
	}

	const onlineNew = $derived.by(() => {
		if (!online) return [];
		const seen = new Set([...(local?.mine ?? []), ...(local?.local ?? [])].map((f) => f.id));
		return online.results.filter((f) => !seen.has(f.id));
	});
	const usdaHint = $derived(app.usdaEnabled ? ' & USDA' : '');
	// avoid listing the same food in several suggestion sections
	const frequentList = $derived.by(() => {
		const fav = new Set(suggestions?.favorites.map((f) => f.id));
		return (suggestions?.frequent ?? []).filter((f) => !fav.has(f.id)).slice(0, 5);
	});
	const recentList = $derived.by(() => {
		const seen = new Set([...(suggestions?.favorites ?? []), ...frequentList].map((f) => f.id));
		return (suggestions?.recent ?? []).filter((f) => !seen.has(f.id));
	});
</script>

<div class="add-panel">
	<div class="search-bar">
		<label class="search-field">
			<Icon name="search" size={18} />
			<span class="visually-hidden">{t('add.searchPlaceholder')}</span>
			<input
				id={inputId}
				bind:this={inputEl}
				bind:value={q}
				oninput={onInput}
				onkeydown={onKey}
				type="search"
				enterkeyhint="search"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder={t('add.searchPlaceholder')}
				data-testid="search-input"
			/>
			{#if q}
				<button
					class="clear"
					onclick={() => {
						q = '';
						local = null;
						online = null;
						inputEl?.focus();
					}}
					aria-label={t('app.close')}><Icon name="close" size={14} stroke={3} /></button
				>
			{/if}
		</label>
		<button
			class="scan-btn"
			onclick={() => (scanning = true)}
			aria-label={t('add.scan')}
			data-testid="scan-button"
		>
			<Icon name="barcode" size={22} />
		</button>
	</div>

	{#if barcodeState}
		<div class="barcode-card" data-testid="barcode-result">
			{#if barcodeState.status === 'loading'}
				<p>{t('scan.looking')}</p>
			{:else}
				<p>
					{barcodeState.status === 'notfound'
						? t('scan.notFound', { code: barcodeState.code })
						: barcodeState.status === 'limited'
							? t('scan.limited')
							: t('scan.error')}
				</p>
				<div class="bc-actions">
					<button
						class="btn small"
						onclick={() => createWithBarcode(barcodeState!.code)}
						data-testid="create-with-barcode"
					>
						{t('scan.createWithBarcode')}
					</button>
					<button
						class="btn small secondary"
						onclick={() => ((barcodeState = null), (scanning = true))}>{t('scan.again')}</button
					>
				</div>
			{/if}
		</div>
	{/if}

	{#if !q.trim()}
		{#if suggestions && (suggestions.favorites.length || suggestions.recent.length)}
			{#if suggestions.favorites.length}
				<h3 class="section-header">{t('add.favorites')}</h3>
				<div class="group" data-testid="favorites-list">
					{#each suggestions.favorites as f (f.id)}<FoodRow food={f} {onselect} />{/each}
				</div>
			{/if}
			{#if frequentList.length}
				<h3 class="section-header">{t('add.frequent')}</h3>
				<div class="group">
					{#each frequentList as f (f.id)}<FoodRow food={f} {onselect} />{/each}
				</div>
			{/if}
			{#if recentList.length}
				<h3 class="section-header">{t('add.recent')}</h3>
				<div class="group" data-testid="recent-list">
					{#each recentList as f (f.id)}<FoodRow food={f} {onselect} />{/each}
				</div>
			{/if}
		{:else if suggestions}
			<p class="empty">{t('add.emptySuggestions')}</p>
		{/if}
	{:else if local}
		{#if local.mine.length}
			<h3 class="section-header">{t('add.mine')}</h3>
			<div class="group">
				{#each local.mine as f (f.id)}<FoodRow food={f} {onselect} />{/each}
			</div>
		{/if}
		{#if local.local.length}
			<h3 class="section-header">{t('add.local')}</h3>
			<div class="group" data-testid="local-results">
				{#each local.local as f (f.id)}<FoodRow food={f} {onselect} />{/each}
			</div>
		{/if}
		{#if !local.mine.length && !local.local.length}
			<p class="empty">{t('add.noResults', { q: local.query })}</p>
		{/if}

		<h3 class="section-header">{t('add.online')}</h3>
		{#if onlineLoading}
			<p class="empty">{t('add.searchingOnline')}</p>
		{:else if online}
			{#if online.limited}<p class="section-footer warn">{t('add.onlineLimited')}</p>{/if}
			{#if online.error && !onlineNew.length}<p class="section-footer warn">
					{t('add.onlineError')}
				</p>{/if}
			{#if onlineNew.length}
				<div class="group" data-testid="online-results">
					{#each onlineNew as f (f.id)}<FoodRow food={f} {onselect} />{/each}
				</div>
			{:else if !online.limited && !online.error}
				<p class="section-footer">{t('add.onlineNone')}</p>
			{/if}
		{:else}
			<button class="row online-btn" onclick={runOnline} data-testid="search-online">
				<Icon name="globe" />
				<span class="grow">
					<span class="row-title">{t('add.searchOnline')}</span>
					<span class="row-sub">{t('add.searchOnlineHint', { usda: usdaHint })}</span>
				</span>
				<span class="chev"><Icon name="chevronRight" size={16} /></span>
			</button>
		{/if}
	{/if}

	{#if showLinks}
		<div class="group links">
			<a
				class="row"
				href="/foods/new"
				onclick={() => (addSheet.open = false)}
				data-testid="link-custom-food"
			>
				<Icon name="plus" />
				<span class="grow">{t('add.createCustom')}</span>
				<span class="chev"><Icon name="chevronRight" size={16} /></span>
			</a>
			<a
				class="row"
				href="/recipes"
				onclick={() => (addSheet.open = false)}
				data-testid="link-recipes"
			>
				<Icon name="recipe" />
				<span class="grow">{t('add.recipes')}</span>
				<span class="chev"><Icon name="chevronRight" size={16} /></span>
			</a>
		</div>
	{/if}
</div>

{#if scanning}
	<BarcodeScanner ondetect={onBarcode} onclose={() => (scanning = false)} />
{/if}

<style>
	.search-bar {
		display: flex;
		gap: 8px;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 5;
		padding: 4px 0 8px;
		background: var(--bg);
	}
	.search-field {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--fill);
		border-radius: 10px;
		padding: 0 8px 0 10px;
		min-height: 40px;
		color: var(--label-2);
	}
	.search-field input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		outline: none;
		color: var(--label);
		min-height: 40px;
		-webkit-appearance: none;
		appearance: none;
	}
	.search-field input::-webkit-search-cancel-button {
		display: none;
	}
	.clear {
		width: 22px;
		height: 22px;
		border-radius: 11px;
		border: 0;
		display: grid;
		place-items: center;
		background: var(--label-3);
		color: var(--bg-elev);
		padding: 0;
	}
	.scan-btn {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 0;
		background: var(--fill);
		color: var(--tint);
		display: grid;
		place-items: center;
		flex: none;
	}
	.online-btn {
		border-radius: var(--radius);
		color: var(--tint);
	}
	.online-btn .row-title {
		display: block;
	}
	.online-btn .row-sub {
		display: block;
	}
	.links {
		margin-top: 28px;
	}
	.links .row {
		color: var(--tint);
	}
	.barcode-card {
		background: var(--bg-elev);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin: 4px 0 8px;
	}
	.barcode-card p {
		margin: 0 0 10px;
	}
	.bc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
