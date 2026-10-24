import 'dotenv/config'
import { z } from 'zod'

/**
 * All configuration comes from the environment and is validated once at boot.
 * See ../.env.example for every variable with its default.
 */

const model = z.string().min(1)

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  /** Public URL of the API (used in widget snippets). */
  PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  /** Console origins allowed to call the API with cookies (comma separated). */
  CONSOLE_ORIGINS: z.string().default('http://localhost:5173'),

  /** postgres://… for PostgreSQL, or pglite://<dir> / pglite://memory for the embedded engine. */
  DATABASE_URL: z.string().default('pglite://./.data/pglite'),
  /** bullmq (needs REDIS_URL) or memory (single process, for tests and quick local runs). */
  QUEUE_DRIVER: z.enum(['bullmq', 'memory']).default('memory'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Run the queue workers inside the API process (true for single-process setups). */
  RUN_WORKERS_IN_API: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),

  /** anthropic, or simulated (deterministic, offline: for tests and demos without a key). */
  LLM_PROVIDER: z.enum(['anthropic', 'simulated']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Models per internal role: never hard-coded in the agents themselves.
  MODEL_ORCHESTRATOR: model.default('claude-sonnet-5-5'),
  MODEL_ARCHITECT: model.default('claude-opus-5-5'),
  MODEL_BUILDER: model.default('claude-sonnet-5-5'),
  MODEL_SECURITY: model.default('claude-opus-5-5'),
  MODEL_TESTER: model.default('claude-haiku-5-5'),
  MODEL_SUPERVISOR: model.default('claude-haiku-5-5'),

  // Team guardrails, per request.
  TEAM_MAX_STEPS: z.coerce.number().int().positive().default(12),
  TEAM_MAX_AGENT_CALLS: z.coerce.number().int().positive().default(10),
  TEAM_MAX_TOKENS: z.coerce.number().int().positive().default(60_000),
  TEAM_MAX_REPEATS: z.coerce.number().int().positive().default(2),
  SUPERVISOR_INTERVAL_SEC: z.coerce.number().int().min(0).default(300),

  // User agent runtime limits.
  RUN_MAX_STEPS: z.coerce.number().int().positive().default(6),
  RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  /** 32+ random chars. HMAC pepper for API keys. */
  KEY_PEPPER: z.string().min(32),
  /** 64 hex chars (32 bytes). AES-256-GCM key for secrets at rest. */
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 7),
  /** Allow site checks to reach private addresses (localhost demo sites). Keep false in production. */
  ALLOW_PRIVATE_SITE_URLS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

// Empty values (`ANTHROPIC_API_KEY=`) mean "not set", so defaults apply.
const parsed = Env.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')))
if (!parsed.success) {
  console.error('Configuration invalide :\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  process.exit(1)
}

const e = parsed.data
export const config = {
  ...e,
  consoleOrigins: e.CONSOLE_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  llmProvider: e.LLM_PROVIDER ?? (e.ANTHROPIC_API_KEY ? 'anthropic' : 'simulated'),
  isProd: e.NODE_ENV === 'production',
}
export type Config = typeof config
