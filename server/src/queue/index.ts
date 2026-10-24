import { Queue, Worker } from 'bullmq'
import { config } from '../config'
import { logger } from '../lib/logger'

/**
 * Task queue. BullMQ + Redis in production; an in-process driver with the same
 * semantics (named queues, at-least-once, concurrency, repeat) for tests and single-process runs.
 */
export type JobHandler = (data: Record<string, unknown>, meta: { id: string; name: string; queue: string }) => Promise<void>

export interface TaskQueue {
  add(queue: string, name: string, data: Record<string, unknown>, opts?: { jobId?: string; delayMs?: number }): Promise<void>
  process(queue: string, handler: JobHandler, concurrency?: number): void
  every(queue: string, name: string, ms: number, data?: Record<string, unknown>): Promise<void>
  /** Resolves when no job is pending or running (memory driver; used by tests). */
  idle(): Promise<void>
  stats(): Promise<Record<string, { waiting: number; active: number }>>
  close(): Promise<void>
}

function memoryQueue(): TaskQueue {
  const handlers = new Map<string, { fn: JobHandler; concurrency: number; active: number }>()
  const pending = new Map<string, { id: string; name: string; data: Record<string, unknown> }[]>()
  const timers = new Set<NodeJS.Timeout>()
  let seq = 0
  let inflight = 0
  let waiters: (() => void)[] = []

  const settle = () => {
    const busy = inflight > 0 || [...pending.values()].some((l) => l.length > 0)
    if (!busy) {
      waiters.forEach((w) => w())
      waiters = []
    }
  }

  const pump = (queue: string) => {
    const h = handlers.get(queue)
    const list = pending.get(queue)
    if (!h || !list) return
    while (h.active < h.concurrency && list.length) {
      const job = list.shift()!
      h.active++
      inflight++
      setImmediate(async () => {
        try {
          await h.fn(job.data, { id: job.id, name: job.name, queue })
        } catch (e) {
          logger.error({ err: e, queue, job: job.name }, 'job failed')
        } finally {
          h.active--
          inflight--
          pump(queue)
          settle()
        }
      })
    }
  }

  const q: TaskQueue = {
    async add(queue, name, data, opts) {
      const job = { id: opts?.jobId ?? `${queue}:${++seq}`, name, data }
      const push = () => {
        const list = pending.get(queue) ?? []
        list.push(job)
        pending.set(queue, list)
        pump(queue)
      }
      if (opts?.delayMs) {
        inflight++
        const t = setTimeout(() => {
          timers.delete(t)
          inflight--
          push()
        }, opts.delayMs)
        timers.add(t)
      } else push()
    },
    process(queue, fn, concurrency = 4) {
      handlers.set(queue, { fn, concurrency, active: 0 })
      pump(queue)
    },
    async every(queue, name, ms, data = {}) {
      const t = setInterval(() => void q.add(queue, name, data), ms)
      t.unref()
      timers.add(t)
    },
    idle: () => new Promise<void>((resolve) => {
      waiters.push(resolve)
      settle()
    }),
    async stats() {
      return Object.fromEntries([...new Set([...pending.keys(), ...handlers.keys()])].map((k) => [k, { waiting: pending.get(k)?.length ?? 0, active: handlers.get(k)?.active ?? 0 }]))
    },
    async close() {
      timers.forEach((t) => clearTimeout(t))
    },
  }
  return q
}

function bullQueue(): TaskQueue {
  const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null }
  const queues = new Map<string, Queue>()
  const workers: Worker[] = []
  const get = (name: string) => {
    let q = queues.get(name)
    if (!q) {
      q = new Queue(name, { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 } })
      queues.set(name, q)
    }
    return q
  }
  return {
    async add(queue, name, data, opts) {
      // BullMQ refuses ':' in custom ids; the per-agent prefix is kept with '.'.
      await get(queue).add(name, data, { jobId: opts?.jobId?.replaceAll(':', '.'), delay: opts?.delayMs })
    },
    process(queue, fn, concurrency = 4) {
      const w = new Worker(queue, async (job) => fn(job.data, { id: String(job.id), name: job.name, queue }), { connection, concurrency })
      w.on('failed', (job, err) => logger.error({ err, queue, job: job?.name }, 'job failed'))
      workers.push(w)
    },
    async every(queue, name, ms, data = {}) {
      await get(queue).upsertJobScheduler(`${queue}:${name}`, { every: ms }, { name, data })
    },
    async idle() {},
    async stats() {
      const out: Record<string, { waiting: number; active: number }> = {}
      for (const [k, q] of queues) {
        const c = await q.getJobCounts('waiting', 'active', 'delayed')
        out[k] = { waiting: (c.waiting ?? 0) + (c.delayed ?? 0), active: c.active ?? 0 }
      }
      return out
    },
    async close() {
      await Promise.all([...workers.map((w) => w.close()), ...[...queues.values()].map((q) => q.close())])
    },
  }
}

export const queue: TaskQueue = config.QUEUE_DRIVER === 'bullmq' ? bullQueue() : memoryQueue()
