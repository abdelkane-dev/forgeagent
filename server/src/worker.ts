import { config } from './config'
import { database } from './db/client'
import { runMigrations } from './db/migrate'
import { logger } from './lib/logger'
import { queue } from './queue'
import { startBackgroundJobs } from './runtime/jobs'
import { startWebhookWorker } from './services/webhooks'
import { startTeamWorkers } from './team/engine'

/** Dedicated worker process (docker compose `worker` service): consumes the BullMQ queues. */
async function main() {
  if (config.QUEUE_DRIVER !== 'bullmq') logger.warn('QUEUE_DRIVER=memory : un worker séparé ne voit pas les tâches de l’API. Utilisez bullmq.')
  await runMigrations()
  await database.lockToAppRole()
  startTeamWorkers()
  startBackgroundJobs()
  startWebhookWorker()
  logger.info('worker ForgeAgent démarré')
  const stop = async () => {
    await queue.close()
    await database.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main().catch((e) => {
  logger.fatal(e)
  process.exit(1)
})
