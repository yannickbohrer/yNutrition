<script lang="ts">
	/**
	 * The portion picker — opened via `openPicker({ food, amount?, date, mode })` from anywhere.
	 * Designed to be reusable for future AI suggestions (pre-filled food + estimated grams).
	 */
	import Sheet from './Sheet.svelte';
	import PortionSlider from './PortionSlider.svelte';
	import NutrientTable from './NutrientTable.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import Icon from './Icon.svelte';
	import { closePicker, picker, toast } from '#lib/stores/ui.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { api } from '#lib/api.ts';
	import { scaleNutrients, KJ_PER_KCAL } from '#lib/nutrition.ts';
	import { accelerate, parseAmount, sliderMax } from '#lib/slider.ts';
	import { fmt, fmtAmount, t } from '#lib/i18n/index.svelte.ts';
	import { nowTimeLocal } from '#lib/dates.ts';
	import type { Portion } from '#lib/types.ts';

	const req = $derived(picker.request);
	const food = $derived(req?.food ?? null);

	let amount = $state(100);
	let time = $state('12:00');
	let date = $state('');
	let extended = $state(0);
	let editing = $state(false);
	let inputValue = $state('');
	let showMore = $state(false);
	let favorite = $state(false);
	let consumedKcal = $state<number | null>(null);
	let portions = $state<Portion[]>([]);
	let inputEl: HTMLInputElement | undefined = $state();

	// initialise whenever a new request comes in
	let lastReq: typeof req = null;
	$effect(() => {
		if (req && req !== lastReq) {
			lastReq = req;
			amount = req.amount ?? req.food.defaultAmount;
			time = req.time ?? nowTimeLocal();
			date = req.date;
			extended = 0;
			editing = false;
			showMore = false;
			favorite = req.food.favorite;
			portions = req.food.portions;
			consumedKcal = null;
			if (req.mode !== 'ingredient') loadDay(req.date, req.excludeKcal ?? 0);
		} else if (!req) {
			lastReq = null;
		}
	});

	async function loadDay(d: string, exclude: number) {
		try {
			const day = await api.day(d);
			consumedKcal = (day.totals.energy_kcal ?? 0) - exclude;
		} catch {
			consumedKcal = null;
		}
	}

	const unit = $derived(food?.basis ?? 'g');
	const max = $derived(
		sliderMax(
			portions.map((p) => p.amount),
			amount,
			extended
		)
	);
	const scaled = $derived(food ? scaleNutrients(food.nutrients, amount) : {});
	const kcal = $derived(scaled.energy_kcal);
	const target = $derived(app.settings.targets.energy_kcal);
	const after = $derived(
		consumedKcal !== null && kcal !== undefined ? target - consumedKcal - kcal : null
	);
	const energyUnit = $derived(app.settings.energyUnit);
	const showEnergy = (k: number | undefined) =>
		k === undefined ? '–' : energyUnit === 'kJ' ? fmt(k * KJ_PER_KCAL) : fmt(k);
	const activePortion = $derived(portions.find((p) => p.amount === amount));

	function setAmount(v: number) {
		amount = Math.max(0, Math.min(20000, Math.round(v * 10) / 10));
		if (amount > max * 0.95) extended++;
	}

	// +/- buttons with long-press acceleration
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let repeats = 0;
	function startHold(dir: 1 | -1, base: number, e: PointerEvent) {
		e.preventDefault();
		repeats = 0;
		bump(dir, base);
		const loop = (delay: number) => {
			holdTimer = setTimeout(() => {
				repeats++;
				bump(dir, accelerate(base, repeats));
				loop(Math.max(45, delay * 0.85));
			}, delay);
		};
		loop(380);
	}
	function stopHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}
	function bump(dir: 1 | -1, step: number) {
		const v =
			dir > 0
				? Math.floor(amount / step + 1e-9) * step + step
				: Math.ceil(amount / step - 1e-9) * step - step;
		setAmount(Math.max(0, v));
	}

	function startEdit() {
		editing = true;
		inputValue = String(amount);
		queueMicrotask(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	}
	function commitEdit() {
		const v = parseAmount(inputValue);
		if (v !== null) setAmount(v);
		editing = false;
	}

	async function toggleFavorite() {
		if (!food) return;
		favorite = !favorite;
		try {
			await api.favorite(food.id, favorite);
		} catch {
			favorite = !favorite;
		}
	}

	async function savePortion() {
		if (!food) return;
		const label = prompt(t('picker.portionName'), `${fmt(amount, 1)} ${unit}`);
		if (!label) return;
		const f = await api.addPortion(food.id, label, amount);
		portions = f.portions;
		toast(t('picker.portionSaved'));
	}

	function confirm() {
		if (!req || amount <= 0) return;
		closePicker({ amount, date, time });
	}
</script>

<Sheet open={!!req} onclose={() => closePicker(null)} label={food?.name ?? t('picker.title')}>
	{#snippet header()}
		{#if food}
			<div class="head">
				<div class="title-wrap">
					<h2 class="title" data-testid="picker-title">{food.name}</h2>
					<div class="meta">
						<SourceBadge source={food.source} />
						{#if food.brand}<span class="brand">{food.brand}</span>{/if}
						{#if food.nutrients.energy_kcal !== undefined}
							<span class="per100 tabular"
								>{showEnergy(food.nutrients.energy_kcal)}
								{energyUnit}{t('add.per100', { unit })}</span
							>
						{/if}
					</div>
				</div>
				<button
					class="icon-btn star"
					class:on={favorite}
					onclick={toggleFavorite}
					aria-pressed={favorite}
					aria-label={t('a11y.favorite')}
					data-testid="picker-favorite"
				>
					<Icon name="star" fill={favorite} size={24} />
				</button>
			</div>
		{/if}
	{/snippet}

	{#if food && req}
		<div class="picker" data-testid="portion-picker">
			<div class="amount-row">
				<button
					class="step"
					aria-label={t('picker.decrease', { step: 5, unit })}
					onpointerdown={(e) => startHold(-1, 5, e)}
					onpointerup={stopHold}
					onpointerleave={stopHold}
					onpointercancel={stopHold}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(-1, 5)}>−5</button
				>
				<button
					class="step"
					aria-label={t('picker.decrease', { step: 1, unit })}
					onpointerdown={(e) => startHold(-1, 1, e)}
					onpointerup={stopHold}
					onpointerleave={stopHold}
					onpointercancel={stopHold}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(-1, 1)}>−1</button
				>
				<div class="amount">
					{#if editing}
						<input
							bind:this={inputEl}
							bind:value={inputValue}
							class="amount-input tabular"
							type="text"
							inputmode="decimal"
							enterkeyhint="done"
							aria-label={t('picker.amountLabel', { unit })}
							onblur={commitEdit}
							onkeydown={(e) => e.key === 'Enter' && commitEdit()}
							data-testid="amount-input"
						/>
					{:else}
						<button
							class="amount-btn tabular"
							onclick={startEdit}
							data-testid="amount-display"
							aria-label={t('picker.amountLabel', { unit })}
						>
							{fmt(amount, 1)}<span class="unit">{unit}</span>
						</button>
					{/if}
					<div class="portion-name">{activePortion?.label ?? ' '}</div>
				</div>
				<button
					class="step"
					aria-label={t('picker.increase', { step: 1, unit })}
					onpointerdown={(e) => startHold(1, 1, e)}
					onpointerup={stopHold}
					onpointerleave={stopHold}
					onpointercancel={stopHold}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(1, 1)}>+1</button
				>
				<button
					class="step"
					aria-label={t('picker.increase', { step: 5, unit })}
					onpointerdown={(e) => startHold(1, 5, e)}
					onpointerup={stopHold}
					onpointerleave={stopHold}
					onpointercancel={stopHold}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(1, 5)}
					data-testid="plus5">+5</button
				>
			</div>

			<PortionSlider bind:value={amount} {max} points={portions} {unit} />
			<div class="slider-foot">
				<button class="link" onclick={() => extended++}>{t('picker.extend')} ›</button>
			</div>

			<div class="chips" role="group" aria-label={t('picker.presets')}>
				{#each portions as p (p.amount)}
					<button
						class="chip"
						class:active={p.amount === amount}
						onclick={() => setAmount(p.amount)}
						data-testid="preset-chip"
					>
						<span class="chip-label">{p.label}</span>
						<span class="chip-amt tabular">{fmt(p.amount, 1)} {unit}</span>
					</button>
				{/each}
			</div>

			<div class="preview" aria-live="polite">
				<div class="kcal">
					<span class="kcal-num tabular" data-testid="preview-kcal">{showEnergy(kcal)}</span>
					<span class="kcal-unit">{energyUnit}</span>
				</div>
				<div class="macros">
					{#each [['protein', 'var(--protein)', 'macros.proteinShort'], ['carbs', 'var(--carbs)', 'macros.carbsShort'], ['fat', 'var(--fat)', 'macros.fatShort']] as const as [k, color, label] (k)}
						<div class="macro">
							<span class="dot" style:background={color}></span>
							<span class="m-val tabular"
								>{scaled[k] === undefined ? '–' : fmtAmount(scaled[k])} g</span
							>
							<span class="m-label">{t(label)}</span>
						</div>
					{/each}
				</div>
				{#if req.mode !== 'ingredient' && after !== null}
					<p class="after" class:over={after < 0} data-testid="after-kcal">
						{after >= 0
							? t('picker.leftAfter', { kcal: `${showEnergy(after)} ${energyUnit}` })
							: t('picker.overAfter', { kcal: `${showEnergy(-after)} ${energyUnit}` })}
					</p>
				{/if}
				{#if food.incomplete}
					<p class="hint warn"><Icon name="warn" size={14} /> {t('picker.incompleteFood')}</p>
				{/if}
			</div>

			<button class="more-btn" onclick={() => (showMore = !showMore)} aria-expanded={showMore}>
				{showMore ? t('picker.less') : t('picker.more')}
				<span class="chev" class:open={showMore}><Icon name="chevronDown" size={16} /></span>
			</button>
			{#if showMore}
				<NutrientTable nutrients={scaled} partial={food.partial} showUnknown />
			{/if}

			{#if req.mode !== 'ingredient'}
				<ul class="group when">
					<li class="row">
						<label class="grow" for="picker-time">{t('picker.time')}</label>
						<input id="picker-time" type="time" bind:value={time} required />
					</li>
					{#if req.mode === 'edit'}
						<li class="row">
							<label class="grow" for="picker-date">{t('picker.date')}</label>
							<input id="picker-date" type="date" bind:value={date} required />
						</li>
					{/if}
				</ul>
			{/if}

			<div class="actions">
				<button class="btn" onclick={confirm} disabled={amount <= 0} data-testid="picker-confirm">
					{req.mode === 'edit' ? t('picker.saveButton') : t('picker.logButton')}
				</button>
				<button class="link small" onclick={savePortion}>{t('picker.savePortion')}</button>
			</div>
		</div>
	{/if}
</Sheet>

<style>
	.head {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding-bottom: 8px;
	}
	.title-wrap {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-size: 20px;
		line-height: 1.2;
		font-weight: 600;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		font-size: 13px;
		color: var(--label-2);
		flex-wrap: wrap;
	}
	.icon-btn {
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 22px;
		background: var(--fill);
		color: var(--label-2);
		display: grid;
		place-items: center;
		flex: none;
	}
	.star.on {
		color: #ffcc00;
	}
	.picker {
		padding-top: 4px;
	}
	.amount-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin: 4px 0 6px;
	}
	.step {
		width: 48px;
		height: 44px;
		flex: none;
		border-radius: 12px;
		border: 0;
		background: var(--bg-elev);
		color: var(--tint);
		font-weight: 600;
		font-size: 16px;
		font-variant-numeric: tabular-nums;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.step:active {
		background: var(--fill-2);
	}
	.amount {
		flex: 1;
		min-width: 0;
		text-align: center;
	}
	.amount-btn,
	.amount-input {
		font-family: var(--font-rounded);
		font-size: 44px;
		line-height: 52px;
		font-weight: 700;
		background: none;
		border: 0;
		padding: 0;
		width: 100%;
		text-align: center;
		color: var(--label);
	}
	.amount-input {
		background: var(--bg-elev);
		border-radius: 12px;
	}
	.unit {
		font-size: 22px;
		font-weight: 600;
		color: var(--label-2);
		margin-left: 4px;
	}
	.portion-name {
		font-size: 13px;
		color: var(--tint);
		min-height: 17px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.slider-foot {
		display: flex;
		justify-content: flex-end;
		margin-top: -2px;
	}
	.link {
		background: none;
		border: 0;
		color: var(--tint);
		font-size: 13px;
		min-height: 32px;
		padding: 0 4px;
	}
	.link.small {
		font-size: 15px;
		min-height: 44px;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 6px 0 10px;
		margin: 0 calc(-1 * var(--gutter));
		padding-left: var(--gutter);
		padding-right: var(--gutter);
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chip {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		min-height: 48px;
		padding: 6px 12px;
		border-radius: 12px;
		border: 1.5px solid transparent;
		background: var(--bg-elev);
		color: var(--label);
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.12s;
	}
	.chip:active {
		transform: scale(0.96);
	}
	.chip.active {
		border-color: var(--tint);
		background: color-mix(in srgb, var(--tint) 10%, var(--bg-elev));
	}
	.chip-label {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
	}
	.chip-amt {
		font-size: 12px;
		color: var(--label-2);
	}
	.preview {
		background: var(--bg-elev);
		border-radius: var(--radius);
		padding: 14px 16px 12px;
	}
	.kcal {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.kcal-num {
		font-family: var(--font-rounded);
		font-size: 34px;
		font-weight: 700;
		line-height: 1;
	}
	.kcal-unit {
		color: var(--label-2);
		font-weight: 600;
	}
	.macros {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 12px;
	}
	.macro {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: 6px;
		align-items: center;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		grid-row: span 2;
	}
	.m-val {
		font-weight: 600;
		font-size: 17px;
	}
	.m-label {
		font-size: 12px;
		color: var(--label-2);
		grid-column: 2;
	}
	.after {
		margin: 12px 0 0;
		font-size: 14px;
		color: var(--label-2);
	}
	.after.over {
		color: var(--over);
		font-weight: 500;
	}
	.preview .hint {
		margin: 8px 0 0;
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.more-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 0;
		color: var(--tint);
		font-size: 15px;
		min-height: 44px;
		padding: 0 4px;
		margin-top: 4px;
	}
	.chev {
		display: inline-flex;
		transition: transform 0.2s;
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.when {
		margin-top: 16px;
	}
	.when input {
		text-align: right;
		background: var(--fill);
		border-radius: 8px;
		border: 0;
		padding: 6px 10px;
		min-height: 36px;
	}
	.actions {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
</style>
