/** Client-side flows shared by several screens. */
import { api } from './api';
import { bumpData, openPicker, toast } from './stores/ui.svelte';
import { t } from './i18n/index.svelte';
import type { EntryDTO, FoodDTO } from './types';
import { scaleNutrients } from './nutrition';

/** Open the portion picker for a food and log the result. Resolves the created entry (or null). */
export async function logFood(
	food: FoodDTO | number,
	date: string,
	opts: { amount?: number } = {}
) {
	const f = typeof food === 'number' ? await api.food(food) : food;
	const res = await openPicker({ food: f, amount: opts.amount, date, mode: 'add' });
	if (!res) return null;
	const entry = await api.addEntry({
		foodId: f.id,
		amount: res.amount,
		date: res.date,
		time: res.time
	});
	bumpData();
	toast(t('add.added', { name: f.name }));
	return entry;
}

/** Edit an entry via the picker (amount, time, date). */
export async function editEntry(entry: EntryDTO): Promise<EntryDTO | null> {
	let food: FoodDTO;
	if (entry.foodId !== null) {
		try {
			food = await api.food(entry.foodId);
		} catch {
			food = fallbackFood(entry);
		}
	} else food = fallbackFood(entry);
	// use the entry's snapshot values so the preview matches what was logged
	food = {
		...food,
		nutrients: entry.per100,
		partial: entry.partial,
		name: entry.name,
		basis: entry.basis
	};
	const kcal = scaleNutrients(entry.per100, entry.amount).energy_kcal ?? 0;
	const res = await openPicker({
		food,
		amount: entry.amount,
		date: entry.date,
		time: entry.time,
		mode: 'edit',
		excludeKcal: entry.date === entry.date ? kcal : 0
	});
	if (!res) return null;
	const updated = await api.updateEntry(entry.id, res);
	bumpData();
	return updated;
}

function fallbackFood(e: EntryDTO): FoodDTO {
	return {
		id: e.foodId ?? -1,
		source: e.source ?? 'custom',
		sourceId: '',
		name: e.name,
		nameDe: e.name,
		nameEn: null,
		brand: e.brand,
		basis: e.basis,
		kcal: e.per100.energy_kcal ?? null,
		favorite: false,
		incomplete: false,
		category: null,
		barcode: null,
		nutrients: e.per100,
		partial: e.partial,
		portions: [{ kind: 'default', label: `100 ${e.basis}`, amount: 100 }],
		defaultAmount: e.amount,
		lastAmount: e.amount,
		sourceUrl: null,
		servingSize: null,
		editable: false,
		deleted: true
	};
}
