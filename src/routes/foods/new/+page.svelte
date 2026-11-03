<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackNav from '#lib/components/BackNav.svelte';
	import CustomFoodForm, { type CustomFoodPayload } from '#lib/components/CustomFoodForm.svelte';
	import { api } from '#lib/api.ts';
	import { toast } from '#lib/stores/ui.svelte.ts';
	import { logFood } from '#lib/logging.ts';
	import { app } from '#lib/stores/app.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';

	const barcode = page.url.searchParams.get('barcode') ?? '';

	async function create(p: CustomFoodPayload) {
		const food = await api.createFood(p);
		toast(t('custom.created'));
		await goto(`/foods/${food.id}`, { replace: true });
		await logFood(food, app.today);
	}
</script>

<svelte:head><title>{t('custom.newTitle')} · Nutrition</title></svelte:head>

<main class="page">
	<BackNav href="/add" label={t('add.title')} />
	<h1 class="large-title">{t('custom.newTitle')}</h1>
	<CustomFoodForm {barcode} onsubmit={create} submitLabel={t('app.save')} />
</main>
