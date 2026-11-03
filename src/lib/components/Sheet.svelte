<script lang="ts" module>
	/** stack of open sheets — Escape closes only the topmost one */
	const stack: symbol[] = [];
</script>

<script lang="ts">
	/**
	 * iOS-style bottom sheet. Drag the grabber/header down to dismiss.
	 * The page behind is locked while the sheet is open (no rubber-band scrolling glitches).
	 */
	import { onDestroy, type Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let {
		open,
		onclose,
		label,
		height = 'auto',
		header,
		children
	}: {
		open: boolean;
		onclose: () => void;
		label: string;
		/** 'auto' | 'full' */
		height?: 'auto' | 'full';
		header?: Snippet;
		children: Snippet;
	} = $props();

	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;
	let sheetEl: HTMLDivElement | undefined = $state();

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
		dragging = true;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		dragY = Math.max(0, e.clientY - startY);
	}
	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		if (dragY > 110) onclose();
		dragY = 0;
	}

	const me = Symbol('sheet');
	$effect(() => {
		if (open) {
			stack.push(me);
			return () => {
				const i = stack.lastIndexOf(me);
				if (i >= 0) stack.splice(i, 1);
			};
		}
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open && stack[stack.length - 1] === me) {
			e.stopPropagation();
			onclose();
		}
	}

	// lock body scroll while open
	let locked = false;
	$effect(() => {
		if (typeof document === 'undefined') return;
		if (open && !locked) {
			locked = true;
			document.documentElement.classList.add('sheet-open');
		} else if (!open && locked) {
			locked = false;
			document.documentElement.classList.remove('sheet-open');
		}
	});
	onDestroy(() => {
		if (locked && typeof document !== 'undefined')
			document.documentElement.classList.remove('sheet-open');
	});

	$effect(() => {
		if (open && sheetEl) {
			// move focus into the sheet for screen readers / keyboard users
			const focusable = sheetEl.querySelector<HTMLElement>(
				'[autofocus], input, button, [tabindex]'
			);
			if (focusable && !sheetEl.contains(document.activeElement))
				focusable.focus({ preventScroll: true });
		}
	});
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div
		class="backdrop"
		transition:fade={{ duration: 200 }}
		onclick={onclose}
		aria-hidden="true"
	></div>
	<div
		class="sheet"
		class:full={height === 'full'}
		class:dragging
		role="dialog"
		aria-modal="true"
		aria-label={label}
		bind:this={sheetEl}
		style:transform={dragY ? `translateY(${dragY}px)` : undefined}
		transition:fly={{ y: 600, duration: 320, easing: cubicOut, opacity: 1 }}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="handle-area"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<div class="grabber" aria-hidden="true"></div>
			{#if header}{@render header()}{/if}
		</div>
		<div class="content">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	:global(html.sheet-open),
	:global(html.sheet-open body) {
		overflow: hidden;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.36);
		z-index: 90;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 100;
		max-height: calc(100dvh - var(--safe-top) - 24px);
		background: var(--bg);
		border-radius: var(--sheet-radius) var(--sheet-radius) 0 0;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
		max-width: 720px;
		margin: 0 auto;
		overscroll-behavior: contain;
	}
	.sheet.full {
		height: calc(100dvh - var(--safe-top) - 12px);
	}
	.sheet.dragging {
		transition: none;
	}
	.handle-area {
		flex: none;
		touch-action: none;
		padding: 6px calc(var(--gutter) + var(--safe-right)) 0 calc(var(--gutter) + var(--safe-left));
		cursor: grab;
	}
	.grabber {
		width: 36px;
		height: 5px;
		border-radius: 3px;
		background: var(--fill-2);
		margin: 0 auto 6px;
	}
	.content {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
		padding: 0 calc(var(--gutter) + var(--safe-right)) calc(var(--safe-bottom) + 16px)
			calc(var(--gutter) + var(--safe-left));
	}
</style>
