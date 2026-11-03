<script lang="ts">
	import { goto } from '$app/navigation';
	import Ring from '#lib/components/Ring.svelte';
	import EntryRow from '#lib/components/EntryRow.svelte';
	import NutrientTable from '#lib/components/NutrientTable.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { bumpData, dataVersion, openAddSheet, toast } from '#lib/stores/ui.svelte.ts';
	import { editEntry } from '#lib/logging.ts';
	import { fmt, fmtDate, t } from '#lib/i18n/index.svelte.ts';
	import { addDays } from '#lib/dates.ts';
	import { KJ_PER_KCAL } from '#lib/nutrition.ts';
	import { MACRO_KEYS, type NutrientKey } from '#lib/nutrients.ts';
	import type { DaySummary, EntryDTO } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// writable derived: follows navigation, can be overwritten by local refreshes
	let day = $derived<DaySummary>(data.day);
	let showAll = $state(false);

	// refresh when log data changes elsewhere (add sheet, picker)
	let seenVersion = dataVersion.v;
	$effect(() => {
		const v = dataVersion.v;
		if (v !== seenVersion) {
			seenVersion = v;
			refresh();
		}
	});

	async function refresh() {
		try {
			day = await api.day(day.date);
		} catch {
			/* ignore */
		}
	}

	const date = $derived(day.date);
	const isToday = $derived(date === app.today);
	const title = $derived(
		isToday
			? t('day.today')
			: date === addDays(app.today, -1)
				? t('day.yesterday')
				: date === addDays(app.today, 1)
					? t('day.tomorrow')
					: fmtDate(date, { weekday: 'long' })
	);
	const subtitle = $derived(
		fmtDate(date, {
			weekday: isToday ? 'long' : undefined,
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	);

	const targets = $derived(app.settings.targets);
	const kcal = $derived(day.totals.energy_kcal ?? 0);
	const remaining = $derived(targets.energy_kcal - kcal);
	const unit = $derived(app.settings.energyUnit);
	const e = (k: number) => (unit === 'kJ' ? k * KJ_PER_KCAL : k);
	const macroColor: Record<string, string> = {
		protein: 'var(--protein)',
		carbs: 'var(--carbs)',
		fat: 'var(--fat)'
	};

	const coreMissing = $derived(
		(['energy_kcal', 'protein', 'carbs', 'fat'] as NutrientKey[])
			.map((k) => ({ k, n: day.missing[k] ?? 0 }))
			.filter((x) => x.n > 0)
	);

	function go(d: string) {
		goto(d === app.today ? '/' : `/?date=${d}`, { reset: false });
	}

	function openAdd() {
		// iOS only opens the keyboard for focus() inside the tap handler → focus a proxy now
		document.getElementById('focus-proxy')?.focus();
		openAddSheet(date);
	}

	async function onDelete(entry: EntryDTO) {
		day = { ...day, entries: day.entries.filter((x) => x.id !== entry.id) };
		try {
			const { row } = await api.deleteEntry(entry.id);
			await refresh();
			toast(t('day.deletedEntry', { name: entry.name }), {
				action: {
					label: t('app.undo'),
					run: async () => {
						await api.restoreEntry(row);
						bumpData();
					}
				}
			});
		} catch {
			await refresh();
		}
	}

	async function onEdit(entry: EntryDTO) {
		await editEntry(entry);
	}

	async function onCopy(entry: EntryDTO) {
		await api.copyEntries([entry.id], app.today);
		toast(t('day.copied'));
	}

	// horizontal swipe on the header switches days
	let sx = 0,
		sy = 0;
	function hdrDown(ev: PointerEvent) {
		sx = ev.clientX;
		sy = ev.clientY;
	}
	function hdrUp(ev: PointerEvent) {
		const dx = ev.clientX - sx;
		if (Math.abs(dx) > 70 && Math.abs(ev.clientY - sy) < 40) go(addDays(date, dx < 0 ? 1 : -1));
	}

	let dateInput: HTMLInputElement | undefined = $state();
	function pickDate() {
		if (!dateInput) return;
		if ('showPicker' in dateInput) {
			try {
				dateInput.showPicker();
				return;
			} catch {
				/* fall back */
			}
		}
		dateInput.focus();
		dateInput.click();
	}
</script>

<svelte:head><title>{title} · Nutrition</title></svelte:head>

<main class="page">
	<div class="nav-row">
		<button
			class="nav-btn"
			onclick={() => go(addDays(date, -1))}
			aria-label={t('day.prev')}
			data-testid="prev-day"
		>
			<Icon name="chevronLeft" />
		</button>
		<div class="nav-center">
			{#if !isToday}
				<button class="nav-btn today-btn" onclick={() => go(app.today)}>{t('day.goToday')}</button>
			{/if}
		</div>
		<div class="nav-right">
			<span class="date-wrap">
				<button class="nav-btn" onclick={pickDate} aria-label={t('day.pickDate')}
					><Icon name="calendar" /></button
				>
				<input
					bind:this={dateInput}
					class="date-input"
					type="date"
					value={date}
					onchange={(ev) => ev.currentTarget.value && go(ev.currentTarget.value)}
					aria-label={t('day.pickDate')}
					tabindex="-1"
				/>
			</span>
			<button
				class="nav-btn"
				onclick={() => go(addDays(date, 1))}
				aria-label={t('day.next')}
				data-testid="next-day"
			>
				<Icon name="chevronRight" />
			</button>
		</div>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header class="day-header" onpointerdown={hdrDown} onpointerup={hdrUp}>
		<h1 class="large-title" data-testid="day-title">{title}</h1>
		<p class="subtitle">{subtitle}</p>
	</header>

	<section class="summary" aria-label={t('day.nutrients')}>
		<Ring
			value={kcal}
			target={targets.energy_kcal}
			color="var(--kcal)"
			size={148}
			width={14}
			label={t('a11y.ring', {
				label: t('macros.energy_kcal'),
				value: fmt(e(kcal)),
				target: fmt(e(targets.energy_kcal))
			})}
		>
			<span class="remain tabular" class:over={remaining < 0} data-testid="kcal-remaining"
				>{fmt(e(Math.abs(remaining)))}</span
			>
			<span class="remain-label" class:over={remaining < 0}
				>{unit} {remaining < 0 ? t('day.over') : t('day.remaining')}</span
			>
		</Ring>
		<div class="summary-side">
			<div class="kcal-line tabular">
				<strong>{fmt(e(kcal))}</strong> / {fmt(e(targets.energy_kcal))}
				{unit}
				{#if app.settings.showKj && unit === 'kcal'}<span class="kj"
						>· {fmt(kcal * KJ_PER_KCAL)} kJ</span
					>{/if}
			</div>
			{#each MACRO_KEYS as k (k)}
				{@const v = day.totals[k] ?? 0}
				{@const tgt = targets[k]}
				<div class="macro-row">
					<Ring
						value={v}
						target={tgt}
						color={macroColor[k]}
						size={34}
						width={5}
						label={t('a11y.ring', { label: t(`macros.${k}`), value: fmt(v), target: fmt(tgt) })}
					/>
					<div class="macro-text">
						<span class="m-name">{t(`macros.${k}`)}</span>
						<span class="m-val tabular" class:over={v > tgt * 1.05}>{fmt(v)} / {fmt(tgt)} g</span>
					</div>
				</div>
			{/each}
		</div>
	</section>

	{#if coreMissing.length}
		<p class="incomplete" data-testid="incomplete-hint">
			<Icon name="warn" size={15} />
			{coreMissing
				.map((m) =>
					m.n === 1
						? t('day.incompleteHintOne', { nutrient: t(`nutrient.${m.k}`) })
						: t('day.incompleteHint', { n: m.n, nutrient: t(`nutrient.${m.k}`) })
				)
				.join(' ')}
		</p>
	{/if}

	{#if day.entries.length}
		<ul class="group timeline" data-testid="timeline">
			{#each day.entries as entry (entry.id)}
				<EntryRow
					{entry}
					onedit={onEdit}
					ondelete={onDelete}
					oncopy={isToday ? undefined : onCopy}
					copyLabel={t('day.copyToToday')}
				/>
			{/each}
		</ul>
		<p class="section-footer">{t('day.swipeHint')}</p>
	{:else}
		<div class="empty-card">
			<p class="empty-title">{t('day.empty')}</p>
			<p class="hint">{t('day.emptyHint')}</p>
		</div>
	{/if}

	<div class="group links">
		<a class="row" href="/copy?to={date}" data-testid="copy-entries-link">
			<Icon name="copy" />
			<span class="grow">{t('day.copyEntries')}</span>
			<span class="chev"><Icon name="chevronRight" size={16} /></span>
		</a>
		<button class="row" onclick={() => (showAll = !showAll)} aria-expanded={showAll}>
			<Icon name="info" />
			<span class="grow">{t('day.showAll')}</span>
			<span class="chev" style:transform={showAll ? 'rotate(90deg)' : undefined}
				><Icon name="chevronRight" size={16} /></span
			>
		</button>
	</div>
	{#if showAll}
		<NutrientTable nutrients={day.totals} missing={day.missing} count={day.count} />
	{/if}
</main>

<button class="fab" onclick={openAdd} aria-label={t('day.addFood')} data-testid="fab-add">
	<Icon name="plus" size={30} stroke={2.6} />
</button>

<style>
	.nav-row {
		margin: 0 -8px;
	}
	.nav-center {
		flex: 1;
		text-align: center;
	}
	.nav-right {
		display: flex;
		align-items: center;
	}
	.today-btn {
		font-size: 15px;
	}
	.date-wrap {
		position: relative;
	}
	.date-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
		width: 100%;
	}
	.day-header {
		touch-action: pan-y;
	}
	.day-header .large-title {
		margin-bottom: 0;
	}
	.subtitle {
		margin: 0 0 14px;
		color: var(--label-2);
		font-size: 15px;
	}
	.summary {
		display: flex;
		align-items: center;
		gap: 18px;
		background: var(--bg-elev);
		border-radius: var(--radius-lg);
		padding: 16px;
	}
	.remain {
		font-family: var(--font-rounded);
		font-size: 30px;
		font-weight: 700;
		line-height: 1.05;
	}
	.remain-label {
		font-size: 12px;
		color: var(--label-2);
		max-width: 90px;
	}
	.remain.over,
	.remain-label.over {
		color: var(--over);
	}
	.summary-side {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.kcal-line {
		font-size: 15px;
		color: var(--label-2);
	}
	.kcal-line strong {
		color: var(--label);
		font-size: 17px;
	}
	.kj {
		font-size: 13px;
	}
	.macro-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.macro-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.m-name {
		font-size: 13px;
		color: var(--label-2);
	}
	.m-val {
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
	}
	.m-val.over {
		color: var(--over);
	}
	.incomplete {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		font-size: 13px;
		color: var(--warning);
		margin: 10px 4px 0;
	}
	.timeline {
		margin-top: 18px;
	}
	.empty-card {
		margin-top: 18px;
		background: var(--bg-elev);
		border-radius: var(--radius);
		padding: 28px 16px;
		text-align: center;
	}
	.empty-title {
		margin: 0 0 4px;
		font-weight: 600;
	}
	.empty-card .hint {
		margin: 0;
	}
	.links {
		margin-top: 24px;
	}
	.links .row {
		color: var(--tint);
	}
	.links .row .grow {
		color: var(--label);
	}
	.chev {
		transition: transform 0.2s;
		display: inline-flex;
	}
	.fab {
		position: fixed;
		right: calc(20px + var(--safe-right));
		bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 18px);
		z-index: 60;
		width: 60px;
		height: 60px;
		border-radius: 30px;
		border: 0;
		background: var(--tint);
		color: #fff;
		display: grid;
		place-items: center;
		box-shadow:
			0 6px 16px color-mix(in srgb, var(--tint) 40%, transparent),
			0 2px 6px rgba(0, 0, 0, 0.18);
		transition: transform 0.15s;
	}
	.fab:active {
		transform: scale(0.92);
	}
	@media (min-width: 760px) {
		.fab {
			right: calc(50% - 360px + 20px);
		}
	}
</style>
