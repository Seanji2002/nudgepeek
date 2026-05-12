import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/renderer/shared/**/*.ts'],
      exclude: ['src/renderer/shared/**/*.test.ts', 'src/renderer/shared/types.ts'],
    },
  },
})
