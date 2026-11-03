import { describe, expect, it } from 'vitest';
import { validBarcode } from './barcode';

describe('barcode check digits', () => {
	it('accepts valid EAN-13 / EAN-8 / UPC-A', () => {
		expect(validBarcode('7612100021842')).toBe(true);
		expect(validBarcode('7610097111188')).toBe(true);
		expect(validBarcode('96385074')).toBe(true);
		expect(validBarcode('036000291452')).toBe(true);
	});
	it('rejects invalid codes', () => {
		expect(validBarcode('7612100021843')).toBe(false);
		expect(validBarcode('12345')).toBe(false);
		expect(validBarcode('abc')).toBe(false);
	});
});
