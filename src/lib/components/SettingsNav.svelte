<script lang="ts">
	/**
	 * Settings sections. On iPhone / iPad portrait this is the link list on the settings page;
	 * on iPad landscape it is the master list of the settings split view (with "General" as the
	 * first entry, since the detail pane then shows the general settings).
	 */
	import { page } from '$app/state';
	import Icon, { type IconName } from './Icon.svelte';
	import { api } from '#lib/api.ts';
	import { t, type MessageKey } from '#lib/i18n/index.svelte.ts';

	let { split = false }: { split?: boolean } = $props();

	const sections: { href: string; icon: IconName; label: MessageKey; hint?: MessageKey }[] = [
		{
			href: '/settings/targets',
			icon: 'target',
			label: 'settings.targets',
			hint: 'settings.targetsHint'
		},
		{
			href: '/settings/passkeys',
			icon: 'key',
			label: 'settings.passkeys',
			hint: 'settings.passkeysHint'
		},
		{ href: '/settings/data', icon: 'download', label: 'settings.data', hint: 'settings.dataHint' },
		{ href: '/settings/about', icon: 'info', label: 'settings.about' }
	];
	const links = $derived(
		split
			? [
					{ href: '/settings', icon: 'gear' as IconName, label: 'settings.general' as MessageKey },
					...sections
				]
			: sections
	);

	async function logout() {
		await api.auth.logout();
		location.href = '/login';
	}
</script>

<ul class="group spaced" class:split data-testid={split ? 'settings-split-nav' : undefined}>
	{#each links as l (l.href)}
		{@const active = split && page.url.pathname === l.href}
		<li>
			<a class="row" class:active href={l.href} aria-current={active ? 'page' : undefined}>
				<span class="ico"><Icon name={l.icon} size={20} /></span>
				<span class="grow">
					<span class="row-title">{t(l.label)}</span>
					{#if l.hint && !split}<span class="row-sub">{t(l.hint)}</span>{/if}
				</span>
				{#if !split}<span class="chev"><Icon name="chevronRight" size={16} /></span>{/if}
			</a>
		</li>
	{/each}
</ul>

<ul class="group spaced">
	<li>
		<button class="row logout" onclick={logout}
			><Icon name="logout" size={20} /> <span class="grow">{t('settings.logout')}</span></button
		>
	</li>
</ul>

<style>
	.spaced {
		margin-top: 28px;
	}
	.ico {
		width: 30px;
		height: 30px;
		border-radius: 7px;
		background: var(--tint);
		color: #fff;
		display: grid;
		place-items: center;
		flex: none;
	}
	.row-title,
	.row-sub {
		display: block;
	}
	.logout {
		color: var(--danger-text);
	}
	.split {
		margin-top: 8px;
	}
	.split .row.active {
		background: var(--tint);
		color: var(--on-tint);
	}
	.split .row.active .ico {
		background: var(--on-tint);
		color: var(--tint);
	}
	/* hide the separator next to the highlighted row */
	.split li:has(.active)::before,
	.split li:has(.active) + li::before {
		display: none;
	}
</style>
