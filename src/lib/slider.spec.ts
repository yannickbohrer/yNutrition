import { describe, expect, it } from 'vitest';
import {
	accelerate,
	freeStep,
	parseAmount,
	sliderMax,
	snapValue,
	visibleTickLabels
} from './slider';

describe('slider', () => {
	it('range adapts to presets (min 300, 3× largest) and value', () => {
		expect(sliderMax([100, 120, 150], 120)).toBe(450);
		expect(sliderMax([40], 40)).toBe(300);
		expect(sliderMax([250, 400], 250)).toBe(1200);
		expect(sliderMax([40], 500)).toBe(700);
		expect(sliderMax([40], 40, 1)).toBe(600);
	});
	it('snaps magnetically within the radius, free values otherwise', () => {
		// 1 px per gram → radius 14 g
		expect(snapValue(112, [100, 120, 150], 1, 1)).toEqual({ value: 120, snapped: 120 });
		expect(snapValue(135.4, [100, 120, 150], 1, 1)).toEqual({ value: 135, snapped: null });
		// 3 px per gram → radius ≈ 4.7 g
		expect(snapValue(112, [100, 120, 150], 3, 1).snapped).toBeNull();
		expect(snapValue(-3, [], 1, 1).value).toBe(0);
	});
	it('free step depends on range', () => {
		expect(freeStep(300)).toBe(1);
		expect(freeStep(1000)).toBe(5);
		expect(freeStep(3000)).toBe(10);
	});
	it('parses typed amounts (comma, apostrophes)', () => {
		expect(parseAmount('12,5')).toBe(12.5);
		expect(parseAmount("1'200")).toBe(1200);
		expect(parseAmount('abc')).toBeNull();
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('-4')).toBeNull();
	});
	it('accelerates long-press steps', () => {
		expect(accelerate(1, 0)).toBe(1);
		expect(accelerate(1, 10)).toBe(2);
		expect(accelerate(5, 20)).toBe(25);
	});
	it('hides overlapping tick labels, keeping the important one', () => {
		const v = visibleTickLabels(
			[{ amount: 100 }, { amount: 120, important: true }, { amount: 150 }],
			1,
			30
		);
		expect([...v].sort()).toEqual([120, 150]);
	});
});
