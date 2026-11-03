<script lang="ts">
	import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import { page } from '$app/state';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import { api, ApiError } from '#lib/api.ts';
	import { t } from '#lib/i18n/index.svelte.ts';

	let busy = $state(false);
	let err = $state('');

	async function login() {
		err = '';
		if (!browserSupportsWebAuthn()) {
			err = t('auth.notSupported');
			return;
		}
		busy = true;
		try {
			const options = await api.auth.loginOptions();
			const response = await startAuthentication({ optionsJSON: options as never });
			await api.auth.loginVerify(response);
			const next = page.url.searchParams.get('next');
			location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
		} catch (e) {
			if (e instanceof ApiError && e.status === 429) err = t('auth.rateLimited');
			else if (e instanceof Error && e.name === 'NotAllowedError') err = t('auth.cancelled');
			else err = t('auth.loginFailed');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t('auth.loginTitle')} · Nutrition</title></svelte:head>

<AuthCard title={t('auth.loginTitle')}>
	<p>{t('auth.loginText')}</p>
	<button class="btn" onclick={login} disabled={busy} data-testid="login-button">
		{busy ? t('auth.loggingIn') : t('auth.loginButton')}
	</button>
	{#if err}<p class="error" role="alert">{err}</p>{/if}
</AuthCard>
