#!/usr/bin/env node
/**
 * Boots the static production servers and the bff together, in the
 * foreground, and stays up. This is what Playwright's webServer manages for
 * the e2e suite: it runs this, waits for :3000 to answer, runs the tests,
 * then sends SIGTERM here and expects both children to go with it.
 *
 *   npm run build && node scripts/serve-all.mjs
 *
 * Exists because the measurement scripts each reimplement "start static
 * servers plus bff, wait for both, tear down after" inline, which is correct
 * for a one-shot script that owns its own lifecycle, but wrong for something
 * a process manager (Playwright) starts and stops around a test run it does
 * not control the shape of.
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const staticServer = spawn('node', [join(root, 'scripts/serve-dist.mjs')], {
  cwd: root,
  stdio: 'inherit',
})

const bff = spawn('npx', ['ts-node', 'src/main.ts'], {
  cwd: join(root, 'bff'),
  stdio: 'inherit',
})

function shutdown() {
  staticServer.kill()
  bff.kill()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
