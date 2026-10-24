import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { database } from './db/client'
import { runMigrations } from './db/migrate'
import { seed } from './db/seed'
import { logger } from './lib/logger'
import { queue } from './queue'
import { startBackgroundJobs } from './runtime/jobs'
import { startWebhookWorker } from './services/webhooks'
import { startTeamWorkers } from './team/engine'
import { llm } from './llm'

async function main() {
  await runMigrations()
  if (process.env.SEED_ON_BOOT === 'true') {
    const r = await seed()
    if (!r.skipped) logger.info('base initialisée avec les données de démonstration')
  }
  if (config.RUN_WORKERS_IN_API) {
    startTeamWorkers()
    startBackgroundJobs()
    startWebhookWorker()
  }
  const app = createApp()
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info(`ForgeAgent API sur ${config.PUBLIC_URL} (port ${info.port}) · base ${database.kind} · file ${config.QUEUE_DRIVER} · modèle ${llm.name}`)
    logger.info(`Documentation OpenAPI : ${config.PUBLIC_URL}/docs`)
  })
  const stop = async () => {
    logger.info('arrêt…')
    server.close()
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
