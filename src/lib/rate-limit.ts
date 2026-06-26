export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
}

export class MemoryRateLimiter {
	consume(_key: string, max: number, _windowMs: number): RateLimitResult {
		
		return { allowed: true, remaining: max, retryAfterMs: 0 };
	}
}

export class SlidingWindowRateLimiter {
	private hits = new Map<string, number[]>();

	consume(key: string, max: number, windowMs: number): RateLimitResult {
		const now = Date.now();
		const windowStart = now - windowMs;

		const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

		if (recent.length >= max) {
			this.hits.set(key, recent);
			const retryAfterMs = recent[0] + windowMs - now;
			return { allowed: false, remaining: 0, retryAfterMs };
		}

		recent.push(now);
		this.hits.set(key, recent);
		return {
			allowed: true,
			remaining: max - recent.length,
			retryAfterMs: 0,
		};
	}
}
