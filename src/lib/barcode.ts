/**
 * Barcode detection: native BarcodeDetector where available, otherwise the ZXing-WASM ponyfill.
 * The WASM binary is served from our own origin (no third-party CDN).
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Detector {
	detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}

declare global {
	interface Window {
		/** E2E test hook: a barcode the "camera" will report */
		__NUTRITION_TEST_BARCODE__?: string;
	}
}

export async function createDetector(): Promise<Detector> {
	if (typeof window !== 'undefined' && window.__NUTRITION_TEST_BARCODE__) {
		const code = window.__NUTRITION_TEST_BARCODE__;
		return { detect: async () => [{ rawValue: code, format: 'ean_13' }] };
	}
	const Native = (
		globalThis as unknown as {
			BarcodeDetector?: {
				new (o: unknown): Detector;
				getSupportedFormats?: () => Promise<string[]>;
			};
		}
	).BarcodeDetector;
	if (Native?.getSupportedFormats) {
		try {
			const supported = await Native.getSupportedFormats();
			if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
		} catch {
			/* fall through to ponyfill */
		}
	}
	const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
	prepareZXingModule({
		overrides: {
			locateFile: (path: string, prefix: string) =>
				path.endsWith('.wasm') ? wasmUrl : prefix + path
		}
	});
	return new BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
}

/** Validate EAN-13/EAN-8/UPC-A check digit. */
export function validBarcode(code: string): boolean {
	if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
	const digits = code.split('').map(Number);
	const check = digits.pop()!;
	const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
	return (10 - (sum % 10)) % 10 === check;
}
