// Isolated, offline test environment: in-memory Postgres (PGlite), in-process queue, simulated model.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'pglite://memory'
process.env.QUEUE_DRIVER = 'memory'
process.env.LLM_PROVIDER = 'simulated'
process.env.SUPERVISOR_INTERVAL_SEC = '0'
process.env.KEY_PEPPER = 'test-pepper-0123456789abcdef0123456789'
process.env.ENCRYPTION_KEY = '0'.repeat(64)
process.env.ALLOW_PRIVATE_SITE_URLS = 'true'
delete process.env.ANTHROPIC_API_KEY
