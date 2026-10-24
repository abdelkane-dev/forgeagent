import { EventEmitter } from 'node:events'
import { Redis } from 'ioredis'
import { config } from '../config'
import { logger } from './logger'

/**
 * Pub/sub for live updates (log tail, site events, team progress).
 * In-process with the memory driver; Redis pub/sub when workers run in other processes.
 */
type Handler = (payload: unknown) => void

interface Bus {
  publish(channel: string, payload: unknown): void
  subscribe(channel: string, handler: Handler): () => void
}

function memoryBus(): Bus {
  const ee = new EventEmitter()
  ee.setMaxListeners(1000)
  return {
    publish: (ch, p) => ee.emit(ch, p),
    subscribe: (ch, h) => {
      ee.on(ch, h)
      return () => ee.off(ch, h)
    },
  }
}

function redisBus(): Bus {
  const pub = new Redis(config.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: null })
  const sub = new Redis(config.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: null })
  const local = memoryBus()
  const counts = new Map<string, number>()
  sub.on('message', (ch, msg) => {
    try {
      local.publish(ch, JSON.parse(msg))
    } catch (e) {
      logger.warn({ e }, 'bus: invalid message')
    }
  })
  return {
    publish: (ch, p) => void pub.publish(ch, JSON.stringify(p)),
    subscribe: (ch, h) => {
      const n = counts.get(ch) ?? 0
      if (n === 0) void sub.subscribe(ch)
      counts.set(ch, n + 1)
      const off = local.subscribe(ch, h)
      return () => {
        off()
        const left = (counts.get(ch) ?? 1) - 1
        counts.set(ch, left)
        if (left === 0) void sub.unsubscribe(ch)
      }
    },
  }
}

export const bus: Bus = config.QUEUE_DRIVER === 'bullmq' ? redisBus() : memoryBus()
