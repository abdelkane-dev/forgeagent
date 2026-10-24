import { Redis } from 'ioredis'
import { config } from '../config'

/** Fixed-window counter. Redis when workers are distributed, memory otherwise. */
const memory = new Map<string, { count: number; resetAt: number }>()
const redis = config.QUEUE_DRIVER === 'bullmq' ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }) : null

export async function hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; remaining: number }> {
  if (redis) {
    const k = `rl:${key}:${Math.floor(Date.now() / windowMs)}`
    const n = await redis.incr(k)
    if (n === 1) await redis.pexpire(k, windowMs)
    return { ok: n <= limit, remaining: Math.max(0, limit - n) }
  }
  const now = Date.now()
  const cur = memory.get(key)
  if (!cur || cur.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }
  cur.count++
  return { ok: cur.count <= limit, remaining: Math.max(0, limit - cur.count) }
}

/** Test helper. */
export const resetRateLimits = () => memory.clear()
