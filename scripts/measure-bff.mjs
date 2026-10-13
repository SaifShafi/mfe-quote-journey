#!/usr/bin/env node
/**
 * Stage 3 measurement: what does aggregating at the BFF actually save, in
 * round trips the browser makes. Run with:
 *
 *   npm run measure:bff
 *
 * BFF_MODE is baked into host-shell's bundle at build time by webpack's
 * DefinePlugin (see host-shell/webpack.config.js and host-shell/src/bff.ts),
 * the same pattern MFE_SHARED uses for Stage 1. 'split' makes host-shell call
 * the two downstream endpoints directly, which is what it would have to do if
 * there were no /journey aggregator. 'aggregated' is the real configuration
 * and is always rebuilt last, so the working tree is left in the real state.
 *
 * remote-quote and remote-account do not read BFF_MODE, so they are built
 * once. Only host-shell is rebuilt per mode.
 */
import { execFileSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const MODES = [
  ['split', 'No aggregator: one request per remote plus one for the session'],
  ['aggregated', 'The real BFF: one request for the session, one for the journey'],
]

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' })
}

function buildRemotesOnce() {
  run('npm', ['--workspace', 'remote-quote', 'run', 'build'])
  run('npm', ['--workspace', 'remote-account', 'run', 'build'])
}

function buildHost(mode) {
  run('npm', ['--workspace', 'host-shell', 'run', 'build'], { BFF_MODE: mode })
}

function serveStatic() {
  const child = spawn('node', [join(root, 'scripts/serve-dist.mjs')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve) => {
    let seen = 0
    child.stdout.on('data', (d) => {
      seen += String(d).split('\n').filter((l) => l.includes('http://')).length
      if (seen >= 3) resolve(child)
    })
  })
}

function serveBff() {
  const child = spawn('npx', ['ts-node', 'src/main.ts'], {
    cwd: join(root, 'bff'),
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      if (String(d).includes('bff on')) resolve(child)
    })
  })
}

async function measureRoundTrips(mode) {
  const staticServer = await serveStatic()
  const bffServer = await serveBff()
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const bffRequests = []
  page.on('request', (r) => {
    if (new URL(r.url()).host === 'localhost:4000') {
      bffRequests.push(`${r.method()} ${new URL(r.url()).pathname}`)
    }
  })

  const started = Date.now()
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  const elapsedMs = Date.now() - started

  // / redirects to /vehicle, the sole remote on that route since Stage 2
  // split the journey into its own routes per remote. Whether the account
  // panel also renders correctly is measure-outage.mjs's job, on /cover.
  const rendered = await page.evaluate(() => ({
    registration: document.querySelector('.quote-form input')?.value ?? null,
  }))

  await browser.close()
  staticServer.kill()
  bffServer.kill()
  // Give the port a moment to free before the next mode starts its own bff.
  await new Promise((resolve) => setTimeout(resolve, 300))

  return { mode, bffRequests, elapsedMs, rendered }
}

async function measureCache() {
  const staticServer = await serveStatic()
  const bffServer = await serveBff()
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const cacheHeaders = []
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/journey') {
      cacheHeaders.push(r.headers()['x-cache'])
    }
  })

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })

  await browser.close()
  staticServer.kill()
  bffServer.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))

  return cacheHeaders
}

process.stderr.write('building remotes once\n')
buildRemotesOnce()

const results = []
for (const [mode, label] of MODES) {
  process.stderr.write(`building host-shell with BFF_MODE=${mode}\n`)
  buildHost(mode)
  process.stderr.write(`measuring ${mode}\n`)
  results.push({ label, ...(await measureRoundTrips(mode)) })
}

console.log()
console.log('| BFF_MODE | What it does | Requests to the bff | Round trips | Wall clock |')
console.log('|---|---|---|---|---|')
for (const r of results) {
  console.log(
    `| \`${r.mode}\` | ${r.label} | ${r.bffRequests.join(', ')} | ${r.bffRequests.length} | ${r.elapsedMs}ms |`,
  )
}
console.log()
for (const r of results) {
  console.log(`${r.mode}: registration=${r.rendered.registration}`)
}

console.log()
console.log('Cache proof: reload the composed page twice within the 5s journey ttl.')
const cacheHeaders = await measureCache()
console.log(`X-Cache on load 1 (fresh session, fresh cache): ${cacheHeaders[0]}`)
console.log(`X-Cache on load 2 (new session, same cache key): ${cacheHeaders[1]}`)

const split = results.find((r) => r.mode === 'split')
const aggregated = results.find((r) => r.mode === 'aggregated')
if (split.bffRequests.length <= aggregated.bffRequests.length) {
  console.error('FAILED: aggregation did not reduce round trips')
  process.exit(1)
}
console.log()
console.log(
  `Aggregation saves ${split.bffRequests.length - aggregated.bffRequests.length} round trip(s) to the bff.`,
)
