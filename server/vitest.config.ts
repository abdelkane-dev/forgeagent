import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': new URL('../src/api', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') } },
  test: {
    environment: 'node',
    setupFiles: ['./test/env.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
