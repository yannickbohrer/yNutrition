<script lang="ts" module>
	// Minimal stroke icon set (24×24), SF-Symbols-like.
	const PATHS = {
		today: 'M4 5.5h16v14H4zM4 9.5h16M8 3v4M16 3v4M8 13h3v3H8z',
		plus: 'M12 5v14M5 12h14',
		search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
		chart: 'M5 19V11M10 19V5M15 19v-6M20 19V9',
		gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-1.7 1l-.3 2h-4l-.3-2a7.6 7.6 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7.7 7.7 0 0 1 0-2L3 10.3l2-3.4 1.9.7a7.6 7.6 0 0 1 1.7-1l.3-2h4l.3 2a7.6 7.6 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7.7 7.7 0 0 1 0 2z',
		chevronLeft: 'M15 5l-7 7 7 7',
		chevronRight: 'M9 5l7 7-7 7',
		chevronDown: 'M5 9l7 7 7-7',
		close: 'M6 6l12 12M18 6 6 18',
		barcode: 'M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12',
		star: 'M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z',
		trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
		copy: 'M8 8h11v12H8zM5 16V4h11',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		minus: 'M5 12h14',
		edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
		calendar: 'M4 5.5h16v14H4zM4 9.5h16M8 3v4M16 3v4',
		scale: 'M5 20h14l-2-12H7zM9.5 8a2.5 2.5 0 1 1 5 0',
		recipe: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4',
		info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
		warn: 'M12 3 2 20h20zM12 10v5M12 17.5v.5',
		key: 'M14 4a6 6 0 0 0-5.7 7.9L3 17.2V21h3.8l.7-.7V18h2.3v-2.3h2.3l1.1-1.1A6 6 0 1 0 14 4zM16 7.5h.01',
		download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
		upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
		globe:
			'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9S9.5 5.6 12 3z',
		logout: 'M14 5V3H4v18h10v-2M10 12h11M17 8l4 4-4 4',
		flash: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
		person: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4.5-6 8-6s7 2 8 6',
		target:
			'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.5v1',
		food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11M17 3v18'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let {
		name,
		size = 22,
		stroke = 2,
		fill = false,
		label
	}: { name: IconName; size?: number; stroke?: number; fill?: boolean; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={fill ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	focusable="false"
>
	<path d={PATHS[name]} />
</svg>
