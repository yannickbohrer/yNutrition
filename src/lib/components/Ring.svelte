<script lang="ts">
	/** Activity-style progress ring. Over-target portion is drawn in a distinct colour. */
	let {
		value,
		target,
		color,
		size = 64,
		width = 8,
		label,
		children
	}: {
		value: number;
		target: number;
		color: string;
		size?: number;
		width?: number;
		label: string;
		children?: import('svelte').Snippet;
	} = $props();

	const r = $derived((size - width) / 2);
	const c = $derived(2 * Math.PI * r);
	const ratio = $derived(target > 0 ? value / target : 0);
	const main = $derived(Math.min(ratio, 1));
	const over = $derived(Math.max(0, Math.min(ratio - 1, 1)));
</script>

<div class="ring" style:width="{size}px" style:height="{size}px" role="img" aria-label={label}>
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--ring-track)"
			stroke-width={width}
		/>
		<circle
			class="arc"
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke={color}
			stroke-width={width}
			stroke-linecap="round"
			stroke-dasharray="{main * c} {c}"
			transform="rotate(-90 {size / 2} {size / 2})"
		/>
		{#if over > 0}
			<circle
				class="arc"
				cx={size / 2}
				cy={size / 2}
				{r}
				fill="none"
				stroke="var(--over)"
				stroke-width={width}
				stroke-linecap="round"
				stroke-dasharray="{over * c} {c}"
				transform="rotate(-90 {size / 2} {size / 2})"
			/>
		{/if}
	</svg>
	{#if children}
		<div class="center">{@render children()}</div>
	{/if}
</div>

<style>
	.ring {
		position: relative;
		flex: none;
	}
	.arc {
		transition: stroke-dasharray 0.6s cubic-bezier(0.2, 0.9, 0.3, 1);
	}
	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
</style>
