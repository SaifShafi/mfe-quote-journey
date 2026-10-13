import { defineConfig } from '@playwright/test'

/**
 * Stage 2's runner and config. Stage 1 and 3 already use the `playwright`
 * library directly inside scripts/ for one-shot measurements; this is the
 * other half, a real test suite `npx playwright test` runs in CI, against the
 * composed page, not each remote alone.
 *
 * webServer runs the production build on the real ports, same as the
 * measurement scripts, so this suite and the numbers in the README are
 * exercising the same artifact, not a dev-server build with different
 * behaviour at the edges.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node scripts/serve-all.mjs',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
