/** Global UI state: toasts, add sheet, portion picker. */
import type { FoodDTO } from '../types';

// ---------------- toasts ----------------
export interface Toast {
	id: number;
	message: string;
	action?: { label: string; run: () => void | Promise<void> };
	timeout: number;
}

export const toasts = $state<{ list: Toast[] }>({ list: [] });
let toastId = 0;

export function toast(message: string, opts: { action?: Toast['action']; timeout?: number } = {}) {
	const t: Toast = {
		id: ++toastId,
		message,
		action: opts.action,
		timeout: opts.timeout ?? (opts.action ? 5000 : 2200)
	};
	toasts.list = [...toasts.list.slice(-2), t];
	setTimeout(() => dismissToast(t.id), t.timeout);
	return t.id;
}

export function dismissToast(id: number) {
	toasts.list = toasts.list.filter((t) => t.id !== id);
}

// ---------------- add sheet ----------------
export const addSheet = $state<{ open: boolean; date: string | null }>({ open: false, date: null });

export function openAddSheet(date: string) {
	addSheet.date = date;
	addSheet.open = true;
}

// ---------------- portion picker ----------------
/**
 * The picker is opened with a food and optional pre-filled amount. This is also the entry point
 * for future AI suggestions: an estimator proposes (food, grams) and the user confirms here.
 */
export interface PickerRequest {
	food: FoodDTO;
	amount?: number;
	date: string;
	time?: string;
	mode: 'add' | 'edit' | 'ingredient';
	/** for edit mode: consumed kcal of the day should exclude this entry's kcal */
	excludeKcal?: number;
}

export interface PickerResult {
	amount: number;
	date: string;
	time: string;
}

export const picker = $state<{ request: PickerRequest | null }>({ request: null });
let resolver: ((r: PickerResult | null) => void) | null = null;

export function openPicker(req: PickerRequest): Promise<PickerResult | null> {
	resolver?.(null);
	picker.request = req;
	return new Promise((resolve) => (resolver = resolve));
}

export function closePicker(result: PickerResult | null) {
	picker.request = null;
	const r = resolver;
	resolver = null;
	r?.(result);
}

// ---------------- data refresh signal ----------------
/** Bumped whenever log data changes so pages can refresh. */
export const dataVersion = $state({ v: 0 });
export function bumpData() {
	dataVersion.v++;
}
