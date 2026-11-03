<script lang="ts">
	/** Full-screen camera barcode scanner (rear camera). Requires 2 identical reads to avoid misreads. */
	import { onDestroy, onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { createDetector, validBarcode, type Detector } from '#lib/barcode.ts';
	import { t } from '#lib/i18n/index.svelte.ts';

	let { ondetect, onclose }: { ondetect: (code: string) => void; onclose: () => void } = $props();

	let video: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | null = null;
	let status = $state<'starting' | 'scanning' | 'error'>('starting');
	let manual = $state('');
	let showManual = $state(false);
	let torch = $state(false);
	let torchSupported = $state(false);
	let stopped = false;
	let detector: Detector | null = null;
	let last = '';
	let hits = 0;

	onMount(async () => {
		try {
			detector = await createDetector();
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1280 },
					height: { ideal: 720 }
				},
				audio: false
			});
			if (stopped) return cleanup();
			video!.srcObject = stream;
			await video!.play();
			const track = stream.getVideoTracks()[0];
			const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
			torchSupported = !!caps.torch;
			status = 'scanning';
			loop();
		} catch (e) {
			console.warn('camera error', e);
			// tests may still provide a barcode without a camera
			if (detector && window.__NUTRITION_TEST_BARCODE__) {
				const r = await detector.detect(document.createElement('canvas'));
				if (r[0]) return ondetect(r[0].rawValue);
			}
			status = 'error';
			showManual = true;
		}
	});

	async function loop() {
		if (stopped || !detector || !video) return;
		try {
			if (video.readyState >= 2) {
				const res = await detector.detect(video);
				const code = res.find((r) => validBarcode(r.rawValue))?.rawValue;
				if (code) {
					hits = code === last ? hits + 1 : 1;
					last = code;
					if (hits >= 2 || window.__NUTRITION_TEST_BARCODE__) {
						stopped = true;
						cleanup();
						ondetect(code);
						return;
					}
				}
			}
		} catch {
			/* ignore frame errors */
		}
		setTimeout(() => requestAnimationFrame(loop), 120);
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		torch = !torch;
		try {
			await track.applyConstraints({ advanced: [{ torch } as MediaTrackConstraintSet] });
		} catch {
			torch = false;
		}
	}

	function cleanup() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	function submitManual(e: Event) {
		e.preventDefault();
		const c = manual.replace(/\D/g, '');
		if (c.length >= 8) {
			stopped = true;
			cleanup();
			ondetect(c);
		}
	}

	onDestroy(() => {
		stopped = true;
		cleanup();
	});
</script>

<div
	class="scanner"
	role="dialog"
	aria-modal="true"
	aria-label={t('scan.title')}
	data-testid="scanner"
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video bind:this={video} playsinline muted autoplay></video>
	<div class="overlay">
		<div class="top">
			<button class="round" onclick={onclose} aria-label={t('app.close')}
				><Icon name="close" /></button
			>
			{#if torchSupported}
				<button class="round" class:on={torch} onclick={toggleTorch} aria-label={t('scan.torch')}
					><Icon name="flash" /></button
				>
			{/if}
		</div>
		<div class="frame" aria-hidden="true"></div>
		<p class="status">
			{status === 'starting'
				? t('scan.starting')
				: status === 'error'
					? t('scan.noCamera')
					: t('scan.hint')}
		</p>
		<div class="bottom">
			{#if showManual}
				<form class="manual" onsubmit={submitManual}>
					<input
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						placeholder={t('scan.manualPlaceholder')}
						bind:value={manual}
						aria-label={t('scan.manual')}
						data-testid="manual-barcode"
					/>
					<button class="btn small" type="submit">{t('scan.lookup')}</button>
				</form>
			{:else}
				<button class="btn secondary small" onclick={() => (showManual = true)}
					>{t('scan.manual')}</button
				>
			{/if}
		</div>
	</div>
</div>

<style>
	.scanner {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: #000;
		color: #fff;
	}
	video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: calc(var(--safe-top) + 12px) 16px calc(var(--safe-bottom) + 24px);
	}
	.top {
		width: 100%;
		display: flex;
		justify-content: space-between;
	}
	.round {
		width: 44px;
		height: 44px;
		border-radius: 22px;
		border: 0;
		background: rgba(0, 0, 0, 0.45);
		color: #fff;
		display: grid;
		place-items: center;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}
	.round.on {
		background: #ffcc00;
		color: #000;
	}
	.frame {
		margin-top: 18vh;
		width: min(80vw, 340px);
		height: min(42vw, 180px);
		border-radius: 18px;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
		border: 2px solid rgba(255, 255, 255, 0.85);
	}
	.status {
		margin-top: 18px;
		font-size: 15px;
		text-align: center;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
		max-width: 320px;
	}
	.bottom {
		margin-top: auto;
		width: 100%;
		display: flex;
		justify-content: center;
	}
	.manual {
		display: flex;
		gap: 8px;
		width: 100%;
		max-width: 360px;
	}
	.manual input {
		flex: 1;
		min-height: 44px;
		border-radius: 12px;
		border: 0;
		padding: 0 14px;
		background: rgba(255, 255, 255, 0.92);
		color: #000;
	}
	.btn.secondary {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
	}
</style>
