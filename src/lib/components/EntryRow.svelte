<script lang="ts">
	/** Timeline entry: tap to edit, swipe left to reveal/perform delete (iOS style). */
	import type { EntryDTO } from '#lib/types.ts';
	import SourceBadge from './SourceBadge.svelte';
	import Icon from './Icon.svelte';
	import { fmt, t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { KJ_PER_KCAL } from '#lib/nutrition.ts';

	let {
		entry,
		onedit,
		ondelete,
		oncopy,
		copyLabel
	}: {
		entry: EntryDTO;
		onedit: (e: EntryDTO) => void;
		ondelete: (e: EntryDTO) => void;
		oncopy?: (e: EntryDTO) => void;
		copyLabel?: string;
	} = $props();

	const ACTION_W = 80;
	let x = $state(0);
	let startX = 0;
	let startY = 0;
	let base = 0;
	let tracking = $state(false);
	let horizontal: boolean | null = null;
	let moved = false;
	let width = $state(360);

	function down(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		tracking = true;
		horizontal = null;
		moved = false;
		startX = e.clientX;
		startY = e.clientY;
		base = x;
	}
	function move(e: PointerEvent) {
		if (!tracking) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
			horizontal = Math.abs(dx) > Math.abs(dy);
			if (horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		}
		if (horizontal) {
			moved = true;
			x = Math.min(0, base + dx);
		}
	}
	function up() {
		if (!tracking) return;
		tracking = false;
		if (!horizontal) return;
		const count = oncopy ? 2 : 1;
		if (-x > width * 0.6) {
			x = -width;
			setTimeout(() => ondelete(entry), 160);
		} else if (-x > (ACTION_W * count) / 2) x = -ACTION_W * count;
		else x = 0;
	}
	function click(e: MouseEvent) {
		if (moved) {
			e.preventDefault();
			return;
		}
		if (x !== 0) {
			x = 0;
			return;
		}
		onedit(entry);
	}

	const unit = $derived(app.settings.energyUnit);
	const kcal = $derived(entry.nutrients.energy_kcal);
	const energy = $derived(kcal === undefined ? null : unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal);
</script>

<li class="entry" bind:clientWidth={width} data-testid="entry-row">
	<div
		class="actions"
		aria-hidden={x === 0}
		style:visibility={x === 0 && !tracking ? 'hidden' : undefined}
	>
		{#if oncopy}
			<button
				class="act copy"
				onclick={() => {
					x = 0;
					oncopy(entry);
				}}
				tabindex={x === 0 ? -1 : 0}
				aria-label={copyLabel}><Icon name="copy" /><span>{copyLabel}</span></button
			>
		{/if}
		<button
			class="act del"
			onclick={() => ondelete(entry)}
			tabindex={x === 0 ? -1 : 0}
			aria-label={t('a11y.deleteEntry')}
			data-testid="entry-delete"
		>
			<Icon name="trash" /><span>{t('app.delete')}</span>
		</button>
	</div>
	<button
		class="row content"
		class:anim={!tracking}
		style:transform="translateX({x}px)"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		onclick={click}
		aria-label={t('a11y.openEntry', { name: entry.name })}
	>
		<span class="time tabular">{entry.time}</span>
		<span class="grow">
			<span class="row-title">{entry.name}</span>
			<span class="row-sub">
				<SourceBadge source={entry.source} />
				<span class="tabular">{fmt(entry.amount, 1)} {entry.basis}</span>
				{#if entry.brand}<span>· {entry.brand}</span>{/if}
			</span>
		</span>
		<span class="kcal tabular">{energy === null ? '–' : fmt(energy)}<small> {unit}</small></span>
	</button>
</li>

<style>
	.entry {
		position: relative;
		overflow: hidden;
		list-style: none;
	}
	.actions {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: flex-end;
	}
	.act {
		width: 80px;
		border: 0;
		color: #fff;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 12px;
	}
	.act.del {
		background: var(--danger);
		flex-grow: 1;
		max-width: none;
		justify-content: center;
		align-items: flex-end;
		padding-right: 18px;
	}
	.act.copy {
		background: #8e8e93;
	}
	.content {
		position: relative;
		touch-action: pan-y;
		min-height: 60px;
		gap: 12px;
		user-select: none;
		-webkit-user-select: none;
	}
	.content.anim {
		transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
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
	.row-sub {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.kcal {
		font-weight: 600;
		flex: none;
	}
	.kcal small {
		font-weight: 400;
		color: var(--label-2);
		font-size: 12px;
	}
</style>
