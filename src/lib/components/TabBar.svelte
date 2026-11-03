<script lang="ts">
	/**
	 * Main navigation, one component for three layouts (pure CSS, see app.css breakpoints):
	 *  - phone: floating tab bar (icon above label)
	 *  - iPad portrait: floating tab bar centred at the bottom (icon + label side by side)
	 *  - iPad landscape and larger: sidebar on the left with app title and quick add
	 */
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';
	import { t, type MessageKey } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { isDate } from '#lib/dates.ts';
	import { openAddSheet } from '#lib/stores/ui.svelte.ts';

	const tabs: { href: string; label: MessageKey; icon: IconName; match: (p: string) => boolean }[] =
		[
			{
				href: '/',
				label: 'tabs.today',
				icon: 'today',
				match: (p) => p === '/' || p.startsWith('/copy')
			},
			{
				href: '/add',
				label: 'tabs.add',
				icon: 'search',
				match: (p) => p.startsWith('/add') || p.startsWith('/foods') || p.startsWith('/recipes')
			},
			{
				href: '/insights',
				label: 'tabs.insights',
				icon: 'chart',
				match: (p) => p.startsWith('/insights')
			},
			{
				href: '/settings',
				label: 'tabs.settings',
				icon: 'gear',
				match: (p) => p.startsWith('/settings')
			}
		];

	// the sidebar's quick add logs to the day being viewed (Today tab), else today
	function quickAdd() {
		document.getElementById('focus-proxy')?.focus();
		const d = page.url.pathname === '/' ? page.url.searchParams.get('date') : null;
		openAddSheet(isDate(d) ? d : app.today);
	}
</script>

<nav class="tabbar" aria-label={t('a11y.mainNav')}>
	<div class="side-head" aria-hidden="true">
		<img src="/favicon.svg" alt="" width="28" height="28" />
		<span>{t('app.name')}</span>
	</div>
	<div class="items">
		{#each tabs as tab (tab.href)}
			{@const active = tab.match(page.url.pathname)}
			<a
				href={tab.href}
				class:active
				aria-current={active ? 'page' : undefined}
				data-testid="tab-{tab.icon}"
			>
				<Icon name={tab.icon} size={25} stroke={active ? 2.2 : 1.8} />
				<span>{t(tab.label)}</span>
			</a>
		{/each}
	</div>
	<button class="btn side-add" onclick={quickAdd} data-testid="sidebar-add">
		<Icon name="plus" size={20} stroke={2.4} />
		{t('day.addFood')}
	</button>
</nav>

<style>
	/* ---------- phone: floating tab bar ---------- */
	.tabbar {
		position: fixed;
		left: calc(12px + var(--safe-left));
		right: calc(12px + var(--safe-right));
		bottom: calc(var(--safe-bottom) + 8px);
		z-index: 50;
		max-width: 420px;
		margin: 0 auto;
		padding: 4px;
		background: var(--bg-blur);
		backdrop-filter: saturate(180%) blur(20px);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		border: 0.5px solid var(--sep);
		border-radius: 29px;
		box-shadow: var(--shadow);
		/* avoid jitter during iOS overscroll */
		transform: translateZ(0);
	}
	.items {
		display: flex;
		justify-content: space-around;
	}
	.side-head,
	.side-add {
		display: none;
	}
	a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 50px;
		border-radius: 25px;
		color: var(--label-2);
		font-size: 10.5px;
		font-weight: 500;
		max-width: 120px;
	}
	a.active {
		background: var(--fill);
		color: var(--tab-active, var(--tint));
	}

	/* ---------- iPad portrait: floating tab bar ---------- */
	@media (min-width: 640px) and (min-height: 560px), (min-width: 1000px) {
		.tabbar {
			left: 50%;
			right: auto;
			max-width: none;
			margin: 0;
			bottom: calc(var(--safe-bottom) + 14px);
			transform: translateX(-50%);
			padding: 5px;
			border: 0.5px solid var(--sep);
			border-radius: 28px;
			box-shadow: var(--shadow);
		}
		.items {
			gap: 4px;
		}
		a {
			flex: none;
			flex-direction: row;
			gap: 7px;
			height: 46px;
			max-width: none;
			padding: 0 18px;
			border-radius: 23px;
			font-size: 15px;
			font-weight: 600;
		}
		a :global(svg) {
			width: 22px;
			height: 22px;
		}
		a.active {
			background: var(--fill);
		}
	}

	/* ---------- iPad landscape: sidebar ---------- */
	@media (min-width: 900px) and (min-height: 560px) and (orientation: landscape),
		(min-width: 1000px) and (orientation: landscape) {
		.tabbar {
			top: 0;
			bottom: 0;
			left: var(--shell-inset);
			transform: none;
			width: var(--nav-w);
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: calc(var(--safe-top) + 18px) 12px calc(var(--safe-bottom) + 16px)
				calc(12px + var(--safe-left));
			border: 0;
			border-right: 0.5px solid var(--sep);
			border-radius: 0;
			box-shadow: none;
			background: var(--bg-elev);
		}
		.side-head {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 4px 10px 16px;
			font-size: 22px;
			font-weight: 700;
		}
		.side-head img {
			border-radius: 7px;
		}
		.items {
			flex-direction: column;
			gap: 2px;
		}
		a {
			justify-content: flex-start;
			gap: 12px;
			height: 44px;
			padding: 0 12px;
			border-radius: 10px;
			font-size: 17px;
			font-weight: 500;
			color: var(--label);
		}
		a :global(svg) {
			color: var(--tint);
		}
		a.active {
			background: var(--tint);
			color: var(--on-tint);
		}
		a.active :global(svg) {
			color: var(--on-tint);
		}
		.side-add {
			display: inline-flex;
			margin-top: auto;
			min-height: 46px;
			padding: 0 12px;
			font-size: 16px;
			white-space: nowrap;
		}
	}

	/* centred shell: the sidebar no longer touches the screen edge */
	@media (min-width: 2561px) and (orientation: landscape) {
		.tabbar {
			border-left: 0.5px solid var(--sep);
		}
	}

	@media (hover: hover) and (pointer: fine) {
		a:not(.active):hover {
			background: var(--fill);
		}
	}
</style>
