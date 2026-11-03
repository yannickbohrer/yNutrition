<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Snippet } from 'svelte';
	let { href, label, right }: { href: string; label: string; right?: Snippet } = $props();
</script>

<div class="nav-row back-nav">
	<a class="nav-btn" {href}><Icon name="chevronLeft" /> {label}</a>
	{#if right}{@render right()}{/if}
</div>

<style>
	.back-nav {
		margin-left: -8px;
	}
</style>
