<script lang="ts">
	/**
	 * Big horizontal amount slider with magnetic snap points at common portions.
	 * Snapping gives visual feedback (thumb pulse + highlighted tick), since iOS Safari has no haptics API.
	 */
	import { freeStep, snapValue, visibleTickLabels } from '#lib/slider.ts';
	import type { Portion } from '#lib/types.ts';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';

	let {
		value = $bindable(),
		max,
		points,
		unit,
		onchange
	}: {
		value: number;
		max: number;
		points: Portion[];
		unit: string;
		onchange?: (v: number, snapped: boolean) => void;
	} = $props();

	let width = $state(300);
	let dragging = $state(false);
	let pulse = $state(false);
	let lastSnap: number | null = null;
	let trackEl: HTMLDivElement | undefined = $state();

	const PAD = 14; // half thumb
	const usable = $derived(Math.max(1, width - PAD * 2));
	const pxPerUnit = $derived(usable / max);
	const step = $derived(freeStep(max));
	const amounts = $derived([...new Set(points.map((p) => p.amount))].filter((a) => a <= max));
	const labelled = $derived(
		visibleTickLabels(
			points
				.filter((p) => p.amount <= max)
				.map((p) => ({ amount: p.amount, important: p.default })),
			pxPerUnit,
			46
		)
	);
	const pos = $derived(PAD + Math.min(value, max) * pxPerUnit);
	const snappedNow = $derived(amounts.includes(value));

	function triggerPulse() {
		pulse = false;
		requestAnimationFrame(() => {
			pulse = true;
			setTimeout(() => (pulse = false), 260);
		});
	}

	function setFromX(clientX: number) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const raw = ((clientX - rect.left - PAD) / usable) * max;
		const clamped = Math.max(0, Math.min(max, raw));
		const { value: v, snapped } = snapValue(clamped, amounts, pxPerUnit, step);
		if (snapped !== null && snapped !== lastSnap) triggerPulse();
		lastSnap = snapped;
		if (v !== value) {
			value = v;
			onchange?.(v, snapped !== null);
		}
	}

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		dragging = true;
		lastSnap = amounts.includes(value) ? value : null;
		trackEl?.setPointerCapture(e.pointerId);
		setFromX(e.clientX);
	}
	function move(e: PointerEvent) {
		if (dragging) setFromX(e.clientX);
	}
	function up() {
		dragging = false;
	}

	function key(e: KeyboardEvent) {
		let v = value;
		const big = step * 10;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
		else if (e.key === 'PageUp') v += big;
		else if (e.key === 'PageDown') v -= big;
		else if (e.key === 'Home') v = 0;
		else if (e.key === 'End') v = max;
		else return;
		e.preventDefault();
		value = Math.max(0, Math.min(max, Math.round(v * 10) / 10));
		onchange?.(value, false);
	}
</script>

<div class="slider" bind:clientWidth={width}>
	<div class="labels" aria-hidden="true">
		{#each points as p (p.amount)}
			{#if p.amount <= max && labelled.has(p.amount)}
				<span
					class="tick-label"
					class:active={value === p.amount}
					style:left="{PAD + p.amount * pxPerUnit}px">{p.label}</span
				>
			{/if}
		{/each}
	</div>
	<div
		class="track-area"
		bind:this={trackEl}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		role="slider"
		tabindex="0"
		aria-label={t('a11y.slider')}
		aria-valuemin={0}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext="{fmt(value, 1)} {unit}"
		onkeydown={key}
		data-testid="portion-slider"
	>
		<div class="track">
			<div class="fill" style:width="{Math.max(0, pos - PAD)}px"></div>
		</div>
		{#each amounts as a (a)}
			<div class="tick" class:active={value === a} style:left="{PAD + a * pxPerUnit}px"></div>
		{/each}
		<div
			class="thumb"
			class:dragging
			class:pulse
			class:snapped={snappedNow}
			style:left="{pos}px"
		></div>
	</div>
	<div class="scale" aria-hidden="true">
		<span>0</span>
		<span>{fmt(max / 2)}</span>
		<span>{fmt(max)} {unit}</span>
	</div>
</div>

<style>
	.slider {
		position: relative;
		user-select: none;
		-webkit-user-select: none;
	}
	.labels {
		position: relative;
		height: 18px;
		margin-bottom: 2px;
	}
	.tick-label {
		position: absolute;
		transform: translateX(-50%);
		font-size: 11px;
		color: var(--label-2);
		white-space: nowrap;
		transition:
			color 0.15s,
			transform 0.15s;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tick-label.active {
		color: var(--tint);
		font-weight: 600;
		transform: translateX(-50%) scale(1.08);
	}
	.track-area {
		position: relative;
		height: 44px;
		touch-action: none;
		cursor: pointer;
		outline: none;
	}
	.track-area:focus-visible .thumb {
		box-shadow:
			0 0 0 4px color-mix(in srgb, var(--tint) 45%, transparent),
			0 2px 8px rgba(0, 0, 0, 0.25);
	}
	.track {
		position: absolute;
		left: 14px;
		right: 14px;
		top: 18px;
		height: 8px;
		border-radius: 4px;
		background: var(--fill-2);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--tint);
		border-radius: 4px;
	}
	.tick {
		position: absolute;
		top: 13px;
		width: 2px;
		height: 18px;
		margin-left: -1px;
		border-radius: 1px;
		background: var(--label-3);
		transition:
			background 0.15s,
			height 0.15s,
			top 0.15s;
		pointer-events: none;
	}
	.tick.active {
		background: var(--tint);
		top: 10px;
		height: 24px;
	}
	.thumb {
		position: absolute;
		top: 8px;
		width: 28px;
		height: 28px;
		margin-left: -14px;
		border-radius: 50%;
		background: #fff;
		box-shadow:
			0 0.5px 4px rgba(0, 0, 0, 0.12),
			0 6px 13px rgba(0, 0, 0, 0.12);
		border: 0.5px solid rgba(0, 0, 0, 0.04);
		transition: transform 0.15s cubic-bezier(0.3, 1.6, 0.5, 1);
		pointer-events: none;
		will-change: left, transform;
	}
	.thumb.dragging {
		transform: scale(1.12);
	}
	.thumb.snapped::after {
		content: '';
		position: absolute;
		inset: 8px;
		border-radius: 50%;
		background: var(--tint);
	}
	.thumb.pulse {
		animation: snap 0.26s cubic-bezier(0.3, 1.6, 0.5, 1);
	}
	@keyframes snap {
		0% {
			transform: scale(1.12);
		}
		45% {
			transform: scale(1.32);
		}
		100% {
			transform: scale(1.12);
		}
	}
	.scale {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--label-3);
		padding: 0 4px;
	}
</style>
