<script lang="ts">
	import { fly } from 'svelte/transition';
	import { dismissToast, toasts } from '#lib/stores/ui.svelte.ts';
</script>

<div class="toasts" aria-live="polite" role="status">
	{#each toasts.list as t (t.id)}
		<div class="toast" transition:fly={{ y: 30, duration: 200 }}>
			<span class="msg">{t.message}</span>
			{#if t.action}
				<button
					class="action"
					onclick={async () => {
						dismissToast(t.id);
						await t.action?.run();
					}}>{t.action.label}</button
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: var(--nav-w);
		right: 0;
		bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 84px);
		z-index: 200;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: none;
		padding: 0 16px;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 14px;
		max-width: 520px;
		width: max-content;
		min-height: 44px;
		padding: 8px 8px 8px 16px;
		border-radius: 22px;
		background: color-mix(in srgb, var(--label) 88%, transparent);
		color: var(--bg-elev);
		font-size: 15px;
		box-shadow: var(--shadow);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}
	.msg {
		padding-right: 8px;
	}
	.action {
		border: 0;
		background: none;
		color: color-mix(in srgb, var(--tint) 70%, white);
		font-weight: 600;
		min-height: 36px;
		padding: 0 10px;
		border-radius: 14px;
	}
	/* iPad landscape: no FAB, no tab bar at the bottom */
	@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
		.toasts {
			bottom: calc(var(--safe-bottom) + 28px);
		}
	}
	@media (prefers-color-scheme: dark) {
		.toast {
			background: rgba(58, 58, 60, 0.96);
			color: #fff;
		}
		.action {
			color: var(--tint);
		}
	}
</style>
