#!/usr/bin/env node
/**
 * Stage 4 measurement: what does fetching per route, instead of one
 * aggregated call up front, do to time to interactive. Run with:
 *
 *   npm run measure:lazy
 *
 * LAZY_MODE is baked into host-shell's bundle at build time by webpack's
 * DefinePlugin, the same pattern Stage 1 and 3 use. 'eager' reproduces the
 * Stage 2/3 shape: one call to /journey, kicked off by whichever route's bff
 * function is asked for first, and both routes wait on it regardless of
 * which one actually needs which half. 'lazy' is the real configuration:
 * each route calls only its own downstream endpoint, so neither route waits
 * on data the other one needs.
 *
 * remote-quote and remote-account do not read LAZY_MODE, so they are built
 * once. Only host-shell is rebuilt per mode, and 'lazy' is built last so the
 * working tree is left in the real state.
 */
import { execFileSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const MODES = [
  ['eager', 'One /journey call, kicked off by whichever route loads first'],
  ['lazy', 'Each route fetches only its own resource, on demand'],
]

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' })
}

function buildRemotesOnce() {
  run('npm', ['--workspace', 'remote-quote', 'run', 'build'])
  run('npm', ['--workspace', 'remote-account', 'run', 'build'])
}

function buildHost(mode) {
  run('npm', ['--workspace', 'host-shell', 'run', 'build'], { LAZY_MODE: mode })
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

// Time from navigation start until the route's own form is actually usable:
// there is no further hydration step in this app once the panel is in the
// DOM, so "the panel is there" is time to interactive for this measurement.
async function timeToInteractive(url, readySelector) {
  const staticServer = await serveStatic()
  const bffServer = await serveBff()
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const bffRequests = []
  page.on('request', (r) => {
    if (new URL(r.url()).host === 'localhost:4000') {
      bffRequests.push(new URL(r.url()).pathname)
    }
  })

  const started = Date.now()
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForSelector(readySelector, { state: 'visible' })
  const elapsedMs = Date.now() - started

  await browser.close()
  staticServer.kill()
  bffServer.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))

  return { elapsedMs, bffRequests }
}

// A full journey: land on /vehicle, then navigate to /cover client-side,
// counting every bff request across both.
async function fullJourneyRequests() {
  const staticServer = await serveStatic()
  const bffServer = await serveBff()
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const bffRequests = []
  page.on('request', (r) => {
    if (new URL(r.url()).host === 'localhost:4000') {
      bffRequests.push(new URL(r.url()).pathname)
    }
  })

  await page.goto('http://localhost:3000/vehicle', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Cover' }).click()
  // networkidle is not reliable for this click: with each route fetching its
  // own bff resource independently (Stage 4), /vehicle's own fetch can still
  // be in flight when /cover's starts, and the gap between the two can look
  // like 500ms of quiet on its own. Wait for what the fetch actually
  // produces instead.
  await Promise.race([
    page.waitForSelector('.account-facts', { timeout: 10_000 }),
    page.waitForSelector('.panel--notice', { timeout: 10_000 }),
  ]).catch(() => {})

  await browser.close()
  staticServer.kill()
  bffServer.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))

  return bffRequests
}

process.stderr.write('building remotes once\n')
buildRemotesOnce()

const results = []
for (const [mode, label] of MODES) {
  process.stderr.write(`building host-shell with LAZY_MODE=${mode}\n`)
  buildHost(mode)

  process.stderr.write(`measuring ${mode}: /vehicle alone\n`)
  const vehicleOnly = await timeToInteractive(
    'http://localhost:3000/vehicle',
    '.quote-form',
  )

  process.stderr.write(`measuring ${mode}: /cover alone (deep link)\n`)
  const coverOnly = await timeToInteractive(
    'http://localhost:3000/cover?registration=AB12CDE',
    '.account-facts',
  )

  process.stderr.write(`measuring ${mode}: full journey round trips\n`)
  const journey = await fullJourneyRequests()

  results.push({ mode, label, vehicleOnly, coverOnly, journey })
}

console.log()
console.log('| LAZY_MODE | What it does | /vehicle alone TTI | /vehicle alone bff calls | /cover alone TTI | /cover alone bff calls |')
console.log('|---|---|---|---|---|---|')
for (const r of results) {
  console.log(
    `| \`${r.mode}\` | ${r.label} | ${r.vehicleOnly.elapsedMs}ms | ${r.vehicleOnly.bffRequests.length} (${r.vehicleOnly.bffRequests.join(', ')}) | ${r.coverOnly.elapsedMs}ms | ${r.coverOnly.bffRequests.length} (${r.coverOnly.bffRequests.join(', ')}) |`,
  )
}

console.log()
console.log('| LAZY_MODE | Full journey (both routes) bff requests |')
console.log('|---|---|')
for (const r of results) {
  console.log(`| \`${r.mode}\` | ${r.journey.length} (${r.journey.join(', ')}) |`)
}

const eager = results.find((r) => r.mode === 'eager')
const lazy = results.find((r) => r.mode === 'lazy')

console.log()
// Both modes make exactly one bff call for a single route: /journey is one
// request too, it just does more work server-side. The request-count
// difference only shows up once BOTH routes are visited, which is what the
// second table is for. What a single route gets from 'lazy' is latency, not
// fewer requests: vehicle (120ms) is no longer held up waiting on account
// (150ms), because nothing asked for account. This only fails loudly if
// lazy regresses to being slower, which would mean the per-route fetch
// functions are accidentally serialising on something they should not.
if (lazy.vehicleOnly.elapsedMs > eager.vehicleOnly.elapsedMs) {
  console.error('FAILED: lazy was slower than eager for a single route visit')
  process.exit(1)
}
if (lazy.journey.length <= eager.journey.length) {
  console.error('FAILED: lazy did not cost more requests for the full journey')
  process.exit(1)
}
console.log(
  `lazy costs ${lazy.journey.length - eager.journey.length} more bff request(s) for a full two-route journey.`,
)
console.log(
  `/vehicle alone: lazy is ${eager.vehicleOnly.elapsedMs - lazy.vehicleOnly.elapsedMs}ms faster, no longer waiting on the slower account service.`,
)
console.log(
  `/cover alone: ${Math.abs(eager.coverOnly.elapsedMs - lazy.coverOnly.elapsedMs)}ms apart, expected to be close: account was already the slower call either way.`,
)
