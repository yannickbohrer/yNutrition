<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackNav from '#lib/components/BackNav.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { bumpData, toast } from '#lib/stores/ui.svelte.ts';
	import { addDays, isDate, nowTimeLocal } from '#lib/dates.ts';
	import { fmt, fmtDate, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
	import type { DaySummary, EntryDTO } from '#lib/types.ts';

	const to = $derived.by(() => {
		const d = page.url.searchParams.get('to');
		return isDate(d) ? d : app.today;
	});
	let from = $state(
		addDays(
			isDate(page.url.searchParams.get('to')) ? page.url.searchParams.get('to')! : app.today,
			-1
		)
	);
	let day = $state<DaySummary | null>(null);
	let selected = $state<Set<number>>(new Set());
	let keepTime = $state(true);
	let busy = $state(false);

	$effect(() => {
		const d = from;
		if (!isDate(d)) return;
		selected = new Set();
		api.day(d).then((r) => (day = r));
	});

	const groups = $derived.by(() => {
		const g: { key: MessageKey; entries: EntryDTO[] }[] = [
			{ key: 'copy.morning', entries: [] },
			{ key: 'copy.midday', entries: [] },
			{ key: 'copy.afternoon', entries: [] },
			{ key: 'copy.evening', entries: [] }
		];
		for (const e of day?.entries ?? []) {
			const h = Number(e.time.slice(0, 2));
			g[h < 11 ? 0 : h < 14 ? 1 : h < 17 ? 2 : 3].entries.push(e);
		}
		return g.filter((x) => x.entries.length);
	});

	function toggle(id: number) {
		// selections are replaced immutably, so a plain Set is fine
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const s = new Set(selected);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		selected = s;
	}
	function toggleGroup(entries: EntryDTO[]) {
		const all = entries.every((e) => selected.has(e.id));
		// selections are replaced immutably, so a plain Set is fine
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const s = new Set(selected);
		for (const e of entries) {
			if (all) s.delete(e.id);
			else s.add(e.id);
		}
		selected = s;
	}

	async function copy() {
		if (!selected.size) return;
		busy = true;
		try {
			const r = await api.copyEntries([...selected], to, keepTime ? null : nowTimeLocal());
			bumpData();
			toast(t('copy.done', { n: r.length }));
			goto(to === app.today ? '/' : `/?date=${to}`);
		} finally {
			busy = false;
		}
	}

	const fd = (d: string) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<svelte:head><title>{t('copy.title')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href={to === app.today ? '/' : `/?date=${to}`} label={t('tabs.today')} />
	<h1 class="large-title">{t('copy.title')}</h1>

	<ul class="group">
		<li class="row">
			<label class="grow" for="copy-from">{t('copy.from')}</label>
			<input id="copy-from" type="date" bind:value={from} max={app.today} data-testid="copy-from" />
		</li>
		<li class="row">
			<span class="grow">{t('copy.to')}</span><span class="secondary">{fd(to)}</span>
		</li>
		<li class="row">
			<label class="grow" for="keep-time">{t('copy.keepTime')}</label>
			<input id="keep-time" class="switch" type="checkbox" bind:checked={keepTime} />
		</li>
	</ul>

	{#if day && !day.entries.length}
		<p class="empty">{t('copy.empty')}</p>
	{/if}
	{#each groups as g (g.key)}
		<div class="gh">
			<h2 class="section-header">{t(g.key)}</h2>
			<button class="link" onclick={() => toggleGroup(g.entries)}>
				{g.entries.every((e) => selected.has(e.id)) ? t('copy.selectNone') : t('copy.selectAll')}
			</button>
		</div>
		<ul class="group">
			{#each g.entries as e (e.id)}
				<li>
					<label class="row sel">
						<input
							type="checkbox"
							checked={selected.has(e.id)}
							onchange={() => toggle(e.id)}
							aria-label={e.name}
							data-testid="copy-check"
						/>
						<span class="time tabular">{e.time}</span>
						<span class="grow">
							<span class="row-title">{e.name}</span>
							<span class="row-sub tabular">{fmt(e.amount, 1)} {e.basis}</span>
						</span>
						<span class="tabular">{fmt(e.nutrients.energy_kcal ?? 0)} kcal</span>
					</label>
				</li>
			{/each}
		</ul>
	{/each}

	<div class="bar">
		<button class="btn" onclick={copy} disabled={!selected.size || busy} data-testid="copy-submit">
			{t('copy.copyButton', { n: selected.size })}
		</button>
	</div>
</main>

<style>
	.row input[type='date'] {
		text-align: right;
		flex: none;
	}
	.gh {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
	}
	.link {
		background: none;
		border: 0;
		color: var(--tint);
		font-size: 13px;
		min-height: 32px;
		margin-right: 8px;
	}
	.sel {
		cursor: pointer;
	}
	.sel input {
		width: 22px;
		height: 22px;
		accent-color: var(--tint);
		flex: none;
	}
	.time {
		font-size: 13px;
		color: var(--label-2);
		width: 40px;
		flex: none;
	}
	.grow {
		display: flex;
		flex-direction: column;
	}
	.bar {
		position: sticky;
		bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 12px);
		margin-top: 24px;
	}
</style>
