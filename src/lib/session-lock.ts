import { getRedis } from "@/lib/rate-limit";

const RELEASE_IF_OURS =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/**
 * Run `write` while holding a short Redis lock, so two serverless instances
 * can't run it for the same conversation at once. A phone call's create_lead
 * and book_tour arrive as separate HTTP requests; both saw "no lead yet" and
 * each created one. The second now waits, then finds the first one's lead.
 *
 * Fails open: without Redis, on a Redis error, or once `waitMs` runs out the
 * write runs anyway — a duplicate lead beats a lost one.
 */
export async function withSessionLock<T>(
  key: string,
  write: () => Promise<T>,
  { ttlMs = 20_000, waitMs = 10_000, pollMs = 150 }: { ttlMs?: number; waitMs?: number; pollMs?: number } = {},
): Promise<T> {
  const redis = getRedis();
  if (!redis) return write();

  const lockKey = `staycio:lock:${key}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  let held = false;
  try {
    while (!held) {
      held = (await redis.set(lockKey, token, { nx: true, px: ttlMs })) === "OK";
      if (held || Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } catch (err) {
    console.error("[session-lock] Redis error, writing without the lock:", err);
    return write();
  }
  if (!held) console.warn(`[session-lock] Waited ${waitMs}ms for ${lockKey}; writing anyway`);

  try {
    return await write();
  } finally {
    if (held) {
      // Only delete our own lock: if the write outlived the TTL, another
      // request may hold it now.
      await redis.eval(RELEASE_IF_OURS, [lockKey], [token]).catch((err: unknown) => {
        console.error("[session-lock] Release failed (expires on its own):", err);
      });
    }
  }
}
