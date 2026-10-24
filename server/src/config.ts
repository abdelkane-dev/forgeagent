import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// server/.env first, then the repository's .env (shared with docker compose). Real env vars win.
loadEnv({ path: ['.env', '../.env'], quiet: true })

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
  /** Owner connection used by migrations and the seed (PostgreSQL only). The app itself uses DATABASE_URL (role forge_app). */
  DATABASE_ADMIN_URL: z.string().optional(),
  /** Password given to the forge_app role by the migrations (PostgreSQL only). */
  APP_DB_PASSWORD: z.string().min(12).optional(),

  /** s3 (MinIO, AWS…) or fs (local folder, for tests). Keys are always agents/<agentId>/… */
  STORAGE_DRIVER: z.enum(['s3', 'fs']).default('fs'),
  STORAGE_DIR: z.string().default('./.data/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('forgeagent'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  /** hash = local feature-hashing embeddings (offline, deterministic). */
  EMBEDDINGS_PROVIDER: z.enum(['hash']).default('hash'),
  /** A new version is refused when its regression score drops by more than this many points. */
  REGRESSION_TOLERANCE: z.coerce.number().int().min(0).max(100).default(0),
  /** Lifetime of the capability token given to each internal team task. */
  CAPABILITY_TTL_SEC: z.coerce.number().int().positive().default(600),
  /** bullmq (needs REDIS_URL) or memory (single process, for tests and quick local runs). */
  QUEUE_DRIVER: z.enum(['bullmq', 'memory']).default('memory'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Run the queue workers inside the API process (true for single-process setups). */
  RUN_WORKERS_IN_API: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),

  /** anthropic, or simulated (deterministic, offline: for tests and demos without a key). */
  LLM_PROVIDER: z.enum(['anthropic', 'simulated']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Models per internal role: never hard-coded in the agents themselves.
  MODEL_ORCHESTRATOR: model.default('claude-opus-5-5'),
  MODEL_ARCHITECT: model.default('claude-opus-5-5'),
  MODEL_SECURITY: model.default('claude-opus-5-5'),
  MODEL_BUILDER: model.default('claude-sonnet-5-5'),
  MODEL_TESTER: model.default('claude-sonnet-5-5'),
  MODEL_SUPERVISOR: model.default('claude-haiku-5-5'),
  /** Used by the supervisor as soon as an anomaly is detected. */
  MODEL_SUPERVISOR_ESCALATION: model.default('claude-sonnet-5-5'),

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

  /**
   * Who may create an account: open = anyone (email + password, GitHub or Google), invite = only
   * invited people (and the very first account). The first account is always platform admin.
   */
  SIGNUP_MODE: z.enum(['open', 'invite']).default('open'),
  /**
   * Show the demo accounts and their password on the sign-in page, while they still use SEED_PASSWORD.
   * For local demos only: set to false on any instance reachable by others.
   */
  SHOW_DEMO_ACCOUNTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SEED_PASSWORD: z.string().optional(),
  /** GitHub OAuth app (callback: <PUBLIC_URL>/v1/auth/oauth/github/callback). Both set ⇒ enabled. */
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  /** Google OAuth client, for Gmail and Google Workspace accounts (callback: <PUBLIC_URL>/v1/auth/oauth/google/callback). */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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
  oauth: {
    github: e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET ? { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET } : null,
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : null,
  },
}
export type Config = typeof config
