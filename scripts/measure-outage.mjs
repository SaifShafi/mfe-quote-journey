#!/usr/bin/env node
/**
 * The behavioural check, automated. Run with:
 *
 *   npm run measure:outage
 *
 * Stage 0 proved by hand that killing the remote's server degrades one step and
 * not the page. With two remotes that check has more cases than is reasonable to
 * do by hand, and the interesting one is new: ONE remote down must cost exactly
 * one panel. A single shared error boundary would cost both, and nothing in the
 * code makes that obvious.
 *
 * Stage 2 put each remote on its own route (/vehicle, /cover), so there is no
 * longer one page where both panels can be seen at once. This visits each
 * route separately and checks that route's own remote degrades independently
 * of what the OTHER remote is doing, which is the same guarantee as before,
 * just checked in two page loads instead of one.
 *
 * Runs against the production build, like the other measurements, with each
 * outage simulated by not starting that remote's server.
 */
import { execFileSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CASES = [
  { label: 'both remotes up', down: [] },
  { label: 'remote-quote down', down: ['remote-quote'] },
  { label: 'remote-account down', down: ['remote-account'] },
  { label: 'both remotes down', down: ['remote-quote', 'remote-account'] },
]

function serve(down) {
  const child = spawn('node', [join(root, 'scripts/serve-dist.mjs')], {
    cwd: root,
    env: { ...process.env, MFE_SKIP: down.join(',') },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const expected = 3 - down.length
  return new Promise((resolve) => {
    let seen = 0
    child.stdout.on('data', (d) => {
      seen += String(d).split('\n').filter((l) => l.includes('http://')).length
      if (seen >= expected) resolve(child)
    })
  })
}

async function checkRoute(page, path, panelSelector) {
  const uncaught = []
  const onError = (e) => uncaught.push(e.message)
  page.on('pageerror', onError)

  await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' })

  const state = await page.evaluate(
    (sel) => ({
      shell: !!document.querySelector('.shell-header'),
      panel: !!document.querySelector(sel),
      degraded: document.querySelectorAll('.panel--notice').length,
    }),
    panelSelector,
  )

  page.off('pageerror', onError)
  return { ...state, uncaught }
}

async function run({ label, down }) {
  const server = await serve(down)
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const vehicle = await checkRoute(page, '/vehicle', '.quote-form')
  const account = await checkRoute(page, '/cover?registration=AB12CDE', '.account-facts')

  await browser.close()
  server.kill()
  return { label, down, vehicle, account }
}

const results = []
process.stderr.write('building\n')
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' })
for (const c of CASES) {
  process.stderr.write(`loading with ${c.label}\n`)
  results.push(await run(c))
}

console.log()
console.log(
  '| Outage | /vehicle shell | /vehicle panel | /vehicle degraded | /cover shell | /cover panel | /cover degraded | Uncaught errors |',
)
console.log('|---|---|---|---|---|---|---|---|')
for (const r of results) {
  const yn = (v) => (v ? 'yes' : 'no')
  const uncaught = r.vehicle.uncaught.length + r.account.uncaught.length
  console.log(
    `| ${r.label} | ${yn(r.vehicle.shell)} | ${yn(r.vehicle.panel)} | ${r.vehicle.degraded} | ${yn(r.account.shell)} | ${yn(r.account.panel)} | ${r.account.degraded} | ${uncaught} |`,
  )
}
console.log()

// Fail the command, not just report, so this cannot rot into a number nobody reads.
const broken = results.filter((r) => {
  const vehicleDown = r.down.includes('remote-quote')
  const accountDown = r.down.includes('remote-account')
  return (
    !r.vehicle.shell ||
    !r.account.shell ||
    r.vehicle.uncaught.length > 0 ||
    r.account.uncaught.length > 0 ||
    r.vehicle.panel === vehicleDown ||
    r.account.panel === accountDown ||
    r.vehicle.degraded !== (vehicleDown ? 1 : 0) ||
    r.account.degraded !== (accountDown ? 1 : 0)
  )
})
if (broken.length > 0) {
  console.error('FAILED:', broken.map((r) => r.label).join(', '))
  process.exit(1)
}
console.log('Each route degrades its own remote, and only its own remote.')
