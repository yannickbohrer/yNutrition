/** Tiny in-memory sliding-window rate limiter (single process, single user). */
export interface Limiter {
	/** consume one slot for `key`; false if the limit is reached */
	take(key?: string): boolean;
	/** remaining slots for `key` */
	remaining(key?: string): number;
	/** ms until the next slot frees up (0 if available) */
	retryAfter(key?: string): number;
	reset(): void;
}

export function createLimiter(opts: {
	limit: number;
	windowMs: number;
	now?: () => number;
}): Limiter {
	const hits = new Map<string, number[]>();
	const now = opts.now ?? Date.now;
	const prune = (key: string) => {
		const t = now();
		const arr = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
		hits.set(key, arr);
		if (hits.size > 10_000) {
			for (const [k, v] of hits) if (!v.length) hits.delete(k);
		}
		return arr;
	};
	return {
		take(key = 'global') {
			const arr = prune(key);
			if (arr.length >= opts.limit) return false;
			arr.push(now());
			return true;
		},
		remaining(key = 'global') {
			return Math.max(0, opts.limit - prune(key).length);
		},
		retryAfter(key = 'global') {
			const arr = prune(key);
			if (arr.length < opts.limit) return 0;
			return Math.max(0, opts.windowMs - (now() - arr[0]));
		},
		reset() {
			hits.clear();
		}
	};
}
