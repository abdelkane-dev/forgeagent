import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Agent prompts (agents/*/prompt.md) are read from disk at runtime and copied by the Dockerfile.
  external: ['pg-native'],
})
