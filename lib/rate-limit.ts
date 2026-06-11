const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 5;

const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Best-effort, in-memory, per-instance rate limit. Serverless instances
 * don't share memory, so this isn't a hard global limit — it's a cheap
 * first line of defense against scripted abuse on a single warm instance.
 */
export function isRateLimited(key: string): boolean {
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
