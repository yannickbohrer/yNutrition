<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import { api } from '#lib/api.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { setLang, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
	import type { UserSettings } from '#lib/types.ts';

	async function update(patch: Partial<UserSettings>) {
		app.settings = { ...app.settings, ...patch };
		if (patch.lang) setLang(patch.lang);
		await api.settings(patch);
		await invalidateAll();
	}

	async function logout() {
		await api.auth.logout();
		location.href = '/login';
	}

	const links: { href: string; icon: IconName; label: MessageKey; hint?: MessageKey }[] = [
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
</script>

<svelte:head><title>{t('settings.title')} · Nutrition</title></svelte:head>

<main class="page">
	<h1 class="large-title">{t('settings.title')}</h1>

	<h2 class="section-header">{t('settings.general')}</h2>
	<ul class="group">
		<li class="row">
			<span class="grow">{t('settings.language')}</span>
			<div class="segmented seg" role="group" aria-label={t('settings.language')}>
				<button
					aria-pressed={app.settings.lang === 'de'}
					onclick={() => update({ lang: 'de' })}
					data-testid="lang-de">{t('settings.languageDe')}</button
				>
				<button
					aria-pressed={app.settings.lang === 'en'}
					onclick={() => update({ lang: 'en' })}
					data-testid="lang-en">{t('settings.languageEn')}</button
				>
			</div>
		</li>
		<li class="row">
			<span class="grow">{t('settings.energyUnit')}</span>
			<div class="segmented seg" role="group" aria-label={t('settings.energyUnit')}>
				<button
					aria-pressed={app.settings.energyUnit === 'kcal'}
					onclick={() => update({ energyUnit: 'kcal' })}>kcal</button
				>
				<button
					aria-pressed={app.settings.energyUnit === 'kJ'}
					onclick={() => update({ energyUnit: 'kJ' })}>kJ</button
				>
			</div>
		</li>
		{#if app.settings.energyUnit === 'kcal'}
			<li class="row">
				<label class="grow" for="showkj">{t('settings.showKj')}</label>
				<input
					id="showkj"
					class="switch"
					type="checkbox"
					checked={app.settings.showKj}
					onchange={(e) => update({ showKj: e.currentTarget.checked })}
				/>
			</li>
		{/if}
	</ul>

	<ul class="group spaced">
		{#each links as l (l.href)}
			<li>
				<a class="row" href={l.href}>
					<span class="ico"><Icon name={l.icon} size={20} /></span>
					<span class="grow">
						<span class="row-title">{t(l.label)}</span>
						{#if l.hint}<span class="row-sub">{t(l.hint)}</span>{/if}
					</span>
					<span class="chev"><Icon name="chevronRight" size={16} /></span>
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
</main>

<style>
	.seg {
		width: 170px;
		flex: none;
	}
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
</style>
