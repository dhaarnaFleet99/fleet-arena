import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { checkRateLimit as checkInMemory } from "./rateLimit";

// Lazily initialised — only created if Upstash env vars are present.
// Falls back to in-memory (per-instance) rate limiting in local dev.
let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (_ratelimit) return _ratelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "1 m"), // 20 requests / min per key
    analytics: true,
    prefix: "fleet-arena:rl",
  });
  return _ratelimit;
}

/**
 * Check rate limit for a given key (IP or user ID).
 * Uses Upstash Redis when configured (global across all Vercel instances),
 * falls back to in-memory when UPSTASH_* env vars are absent.
 */
export async function checkStreamRateLimit(
  key: string,
): Promise<{ ok: boolean; retryAfter: number }> {
  const rl = getRatelimit();

  if (!rl) {
    // Local dev fallback — in-memory, per-instance
    return checkInMemory(`stream:${key}`, 20);
  }

  const { success, reset } = await rl.limit(`stream:${key}`);
  if (!success) {
    return { ok: false, retryAfter: Math.ceil((reset - Date.now()) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
