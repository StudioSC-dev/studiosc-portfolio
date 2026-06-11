import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 5;

// Upstash is only connected in Production (see Vercel integration settings).
// Local dev and Preview fall back to the in-memory limiter below.
const ratelimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(MAX_REQUESTS, "10 m"),
        analytics: true,
      })
    : null;

const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Best-effort, in-memory, per-instance rate limit. Serverless instances
 * don't share memory, so this isn't a hard global limit — it's a cheap
 * fallback for environments without Upstash configured.
 */
function isRateLimitedInMemory(key: string): boolean {
  const now = Date.now();

  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k);
    }
  }

  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

export async function isRateLimited(key: string): Promise<boolean> {
  if (ratelimit) {
    const { success } = await ratelimit.limit(key);
    return !success;
  }

  return isRateLimitedInMemory(key);
}
