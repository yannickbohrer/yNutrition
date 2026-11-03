<script lang="ts">
	import { startRegistration } from '@simplewebauthn/browser';
	import { invalidateAll } from '$app/navigation';
	import BackNav from '#lib/components/BackNav.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { api, ApiError } from '#lib/api.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { t, locale } from '#lib/i18n/index.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let busy = $state(false);

	const d = (ms: number | null) =>
		ms
			? new Intl.DateTimeFormat(locale(), {
					dateStyle: 'medium',
					timeZone: 'Europe/Zurich'
				}).format(new Date(ms))
			: t('passkeys.never');

	async function add() {
		busy = true;
		try {
			const options = await api.auth.registerOptions();
			const response = await startRegistration({ optionsJSON: options as never });
			await api.auth.registerVerify(response);
			toast(t('passkeys.added'));
			await invalidateAll();
		} catch (e) {
			if (!(e instanceof Error && e.name === 'NotAllowedError')) toast(t('app.error'));
		} finally {
			busy = false;
		}
	}

	async function rename(id: string, current: string) {
		const name = prompt(t('passkeys.name'), current);
		if (!name) return;
		await api.renamePasskey(id, name);
		await invalidateAll();
	}

	async function remove(id: string, name: string) {
		if (!confirm(t('passkeys.deleteConfirm', { name }))) return;
		try {
			await api.deletePasskey(id);
			await invalidateAll();
		} catch (e) {
			toast(
				e instanceof ApiError && e.status === 409 ? t('passkeys.cannotDeleteLast') : t('app.error')
			);
		}
	}
</script>

<svelte:head><title>{t('passkeys.title')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/settings" label={t('settings.title')} />
	<h1 class="large-title">{t('passkeys.title')}</h1>
	<p class="hint intro">{t('passkeys.intro')}</p>

	<ul class="group" data-testid="passkey-list">
		{#each data.passkeys as p (p.id)}
			<li class="row pk">
				<Icon name="key" />
				<span class="grow">
					<span class="row-title">{p.name}</span>
					<span class="row-sub"
						>{t('passkeys.created')}
						{d(p.createdAt)} · {t('passkeys.lastUsed')}
						{d(p.lastUsedAt)}{p.backedUp ? ` · ${t('passkeys.synced')}` : ''}</span
					>
				</span>
				<button class="mini" onclick={() => rename(p.id, p.name)} aria-label={t('passkeys.rename')}
					><Icon name="edit" size={18} /></button
				>
				<button
					class="mini danger"
					onclick={() => remove(p.id, p.name)}
					aria-label={t('app.delete')}
					disabled={data.passkeys.length <= 1}><Icon name="trash" size={18} /></button
				>
			</li>
		{/each}
	</ul>
	<div style="margin-top: 20px">
		<button class="btn" onclick={add} disabled={busy} data-testid="add-passkey"
			>{t('passkeys.add')}</button
		>
	</div>
	<p class="section-footer">{t('passkeys.recoveryHint')}</p>
</main>

<style>
	.intro {
		margin: 0 4px 16px;
	}
	.row-title,
	.row-sub {
		display: block;
		white-space: normal;
	}
	.mini {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 20px;
		background: var(--fill);
		color: var(--tint);
		display: grid;
		place-items: center;
		flex: none;
	}
	.mini.danger {
		color: var(--danger-text);
	}
	.mini:disabled {
		opacity: 0.35;
	}
</style>
