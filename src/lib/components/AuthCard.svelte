<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<main class="auth">
	<div class="logo" aria-hidden="true">
		<img src="/icons/icon-192.png" alt="" width="84" height="84" />
	</div>
	<h1>{title}</h1>
	{@render children()}
</main>

<style>
	.auth {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px);
		max-width: 420px;
		margin: 0 auto;
		text-align: center;
	}
	.logo img {
		border-radius: 20px;
		box-shadow: var(--shadow);
	}
	h1 {
		font-size: 28px;
		margin: 8px 0 0;
	}
	:global(.auth p) {
		color: var(--label-2);
		margin: 0 0 12px;
		line-height: 1.4;
	}
	:global(.auth .error) {
		color: var(--danger-text);
	}
</style>
