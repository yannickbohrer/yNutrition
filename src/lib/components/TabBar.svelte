<script lang="ts">
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';
	import { t, type MessageKey } from '#lib/i18n/index.svelte.ts';

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
</script>

<nav class="tabbar" aria-label={t('a11y.mainNav')}>
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
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		display: flex;
		justify-content: space-around;
		padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
		background: var(--bg-blur);
		backdrop-filter: saturate(180%) blur(20px);
		-webkit-backdrop-filter: saturate(180%) blur(20px);
		border-top: 0.5px solid var(--sep);
		/* avoid jitter during iOS overscroll */
		transform: translateZ(0);
	}
	a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: var(--tabbar-h);
		color: var(--label-2);
		font-size: 10.5px;
		font-weight: 500;
		max-width: 120px;
	}
	a.active {
		color: var(--tab-active, var(--tint));
	}
</style>
