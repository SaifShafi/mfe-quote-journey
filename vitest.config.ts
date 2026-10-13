import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // The federation config is tested too, and it does not live under a src/.
    include: ['**/src/**/*.test.{ts,tsx}', 'shared-config/*.test.ts'],
  },
})
