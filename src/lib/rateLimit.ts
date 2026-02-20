// Simple in-memory sliding-window rate limiter.
// Works per serverless instance — good enough for basic abuse protection.
// For multi-instance production use, swap the Map for Upstash Redis.

const WINDOW_MS = 60_000; // 1 minute
const store = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs = WINDOW_MS,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter(t => now - t < windowMs);

  if (hits.length >= max) {
    return { ok: false, retryAfter: Math.ceil((hits[0] + windowMs - now) / 1000) };
  }

  hits.push(now);
  store.set(key, hits);
  return { ok: true, retryAfter: 0 };
}
