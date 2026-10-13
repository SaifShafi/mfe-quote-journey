#!/usr/bin/env node
/**
 * Stage 1 measurement, runtime half: what the browser actually fetches and
 * executes, per sharing mode. Run with:
 *
 *   npm run measure:runtime
 *
 * This is the number that matters. A webpack singleton does not make anyone's
 * bundle smaller: every participant still emits a fallback copy of the shared
 * module. What it changes is which copies are fetched and how many module
 * instances exist, and neither of those is visible on disk.
 *
 * The script also reports whether the composed page rendered both remotes and
 * what it logged to the console, because the cost of duplicating React is a
 * runtime failure, not a byte count, and the failure has to be quoted from a
 * real browser to be worth anything.
 *
 * For each mode it builds all three apps, serves the production output, and
 * visits the whole journey with a cold cache: /vehicle, then a client-side
 * navigation to /cover, recording every response across both.
 */
import { execFileSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const MODES = [
  ['none', 'Nothing shared'],
  ['dup-react', 'React shared but not a singleton'],
  ['no-ui', 'React a singleton, shared-ui duplicated'],
  ['all', 'React and shared-ui singletons'],
]

const ORIGINS = {
  'localhost:3000': 'host-shell',
  'localhost:3001': 'remote-quote',
  'localhost:3002': 'remote-account',
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

function build(mode) {
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    env: { ...process.env, MFE_SHARED: mode },
    stdio: 'pipe',
  })
}

function serve() {
  const child = spawn('node', [join(root, 'scripts/serve-dist.mjs')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  // Resolve once all three listeners have reported, so the first page load
  // cannot race the servers coming up.
  return new Promise((resolve) => {
    let seen = 0
    child.stdout.on('data', (d) => {
      seen += String(d).split('\n').filter((l) => l.includes('http://')).length
      if (seen >= 3) resolve(child)
    })
  })
}

async function measure(mode) {
  const server = await serve()
  const browser = await chromium.launch()
  // A fresh context per mode, so nothing is served from a warm cache.
  const context = await browser.newContext()
  const page = await context.newPage()

  const responses = []
  const console_ = []
  page.on('response', async (r) => {
    const url = new URL(r.url())
    if (!url.pathname.endsWith('.js')) return
    const body = await r.body().catch(() => Buffer.alloc(0))
    responses.push({
      origin: url.host,
      file: url.pathname.slice(1),
      bytes: body.length,
      // The honest answer to "how many Reacts are on this page" is how many
      // copies of the implementation the browser actually downloaded. These two
      // strings appear in react and react-dom respectively and in neither the
      // other nor any application code, so they count copies without guessing
      // from chunk names or sizes.
      reactCore: body.includes('unstable_act'),
      reactDom: body.includes('suppressHydrationWarning'),
    })
  })
  page.on('console', (m) => console_.push(`${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`))

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  const vehicle = await page.evaluate(() => !!document.querySelector('.quote-form'))
  const vehicleDegraded = await page.evaluate(
    () => document.querySelectorAll('.panel--notice').length,
  )

  // Stage 2 split the journey into /vehicle and /cover, each mounting one
  // remote. A full journey visits both, so this does too, navigating
  // client-side (not a fresh page.goto) the way a real user would, which
  // keeps host-shell's own bundle out of the second navigation's bytes and
  // leaves only remote_account's federated chunks to be counted on top of
  // what visiting /vehicle already fetched.
  await page.getByRole('link', { name: 'Cover' }).click()
  await page.waitForLoadState('networkidle')
  const account = await page.evaluate(() => !!document.querySelector('.account-facts'))
  const accountDegraded = await page.evaluate(
    () => document.querySelectorAll('.panel--notice').length,
  )

  // Each check happens on the route that remote was actually mounted on;
  // VehicleDetails is gone from the DOM by the time /cover is checked, so its
  // own degraded count has to be captured before navigating away from it.
  const rendered = { vehicle, account, degraded: vehicleDegraded + accountDegraded }

  await browser.close()
  server.kill()

  const perOrigin = {}
  for (const r of responses) {
    const app = ORIGINS[r.origin] ?? r.origin
    perOrigin[app] = (perOrigin[app] ?? 0) + r.bytes
  }

  return {
    mode,
    files: responses.length,
    reactCopies: responses.filter((r) => r.reactCore).length,
    reactDomCopies: responses.filter((r) => r.reactDom).length,
    perOrigin,
    total: responses.reduce((a, r) => a + r.bytes, 0),
    rendered,
    console: console_,
  }
}

const results = []
for (const [mode, label] of MODES) {
  process.stderr.write(`building and loading MFE_SHARED=${mode}\n`)
  build(mode)
  results.push({ label, ...(await measure(mode)) })
}

const apps = Object.keys(ORIGINS).map((o) => ORIGINS[o])
const baseline = results.find((r) => r.mode === 'none').total

console.log()
console.log(
  `| MFE_SHARED | What is shared | ${apps.join(' | ')} | JS fetched | vs nothing shared | react | react-dom | Both routes rendered |`,
)
console.log(`|---|---|${apps.map(() => '---|').join('')}---|---|---|---|---|`)
for (const r of results) {
  const delta = r.total - baseline
  const sign = delta === 0 ? '' : delta < 0 ? '-' : '+'
  const cells = apps.map((a) => kb(r.perOrigin[a] ?? 0)).join(' | ')
  const ok = r.rendered.vehicle && r.rendered.account ? 'yes' : 'no'
  console.log(
    `| \`${r.mode}\` | ${r.label} | ${cells} | ${kb(r.total)} | ${sign}${kb(Math.abs(delta))} | ${r.reactCopies} | ${r.reactDomCopies} | ${ok} |`,
  )
}

console.log()
console.log('react and react-dom columns are copies the browser downloaded.')
console.log()
for (const r of results) {
  console.log(`### MFE_SHARED=${r.mode}`)
  console.log(
    `rendered: vehicle=${r.rendered.vehicle} account=${r.rendered.account} degraded panels=${r.rendered.degraded}, files fetched=${r.files}`,
  )
  if (r.console.length === 0) {
    console.log('console: clean')
  } else {
    for (const line of r.console) console.log(`console: ${line}`)
  }
  console.log()
}
