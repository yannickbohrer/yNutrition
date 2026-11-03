<script lang="ts">
	import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import { api, ApiError } from '#lib/api.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let busy = $state(false);
	let err = $state('');
	let name = $state(guessName());

	function guessName() {
		if (typeof navigator === 'undefined') return '';
		const ua = navigator.userAgent;
		if (/iPhone/.test(ua)) return 'iPhone';
		if (/iPad/.test(ua)) return 'iPad';
		if (/Macintosh/.test(ua)) return 'Mac';
		if (/Android/.test(ua)) return 'Android';
		return 'Passkey';
	}

	async function register() {
		err = '';
		if (!browserSupportsWebAuthn()) {
			err = t('auth.notSupported');
			return;
		}
		busy = true;
		try {
			const options = await api.auth.registerOptions(data.token ?? undefined);
			const response = await startRegistration({ optionsJSON: options as never });
			await api.auth.registerVerify(response, name);
			location.href = '/';
		} catch (e) {
			if (e instanceof ApiError && e.status === 429) err = t('auth.rateLimited');
			else if (e instanceof ApiError && e.status === 403) err = t('auth.setupInvalid');
			else if (e instanceof Error && e.name === 'NotAllowedError') err = t('auth.cancelled');
			else err = t('auth.loginFailed');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t('auth.setupTitle')} · Nutrition</title></svelte:head>

<AuthCard title={t('auth.setupTitle')}>
	{#if data.token}
		<p>{t('auth.setupText')}</p>
		<label class="name">
			<span>{t('auth.deviceName')}</span>
			<input bind:value={name} maxlength="60" autocomplete="off" data-testid="device-name" />
		</label>
		<button class="btn" onclick={register} disabled={busy} data-testid="setup-button"
			>{t('auth.setupButton')}</button
		>
	{:else if data.invalid}
		<p class="error" role="alert">{t('auth.setupInvalid')}</p>
	{:else}
		<p>{t('auth.setupNeedToken')}</p>
	{/if}
	{#if err}<p class="error" role="alert">{err}</p>{/if}
</AuthCard>

<style>
	.name {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		text-align: left;
		font-size: 13px;
		color: var(--label-2);
		margin-bottom: 8px;
	}
	.name input {
		min-height: 44px;
		border-radius: 10px;
		border: 0;
		background: var(--bg-elev);
		padding: 0 12px;
		color: var(--label);
	}
</style>
