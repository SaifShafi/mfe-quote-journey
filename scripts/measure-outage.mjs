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

async function run({ label, down }) {
  const server = await serve(down)
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()

  const uncaught = []
  page.on('pageerror', (e) => uncaught.push(e.message))

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })

  const state = await page.evaluate(() => ({
    // The shell's own content. If this is missing, a remote outage took the page.
    shell: !!document.querySelector('.shell-header'),
    heading: document.querySelector('h1')?.textContent ?? null,
    vehicle: !!document.querySelector('.quote-form'),
    account: !!document.querySelector('.account-facts'),
    degraded: document.querySelectorAll('.panel--notice').length,
  }))

  await browser.close()
  server.kill()
  return { label, down, state, uncaught }
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
  '| Outage | Shell renders | Vehicle panel | Policy panel | Degraded panels | Uncaught page errors |',
)
console.log('|---|---|---|---|---|---|')
for (const r of results) {
  const yn = (v) => (v ? 'yes' : 'no')
  console.log(
    `| ${r.label} | ${yn(r.state.shell)} | ${yn(r.state.vehicle)} | ${yn(r.state.account)} | ${r.state.degraded} | ${r.uncaught.length} |`,
  )
}
console.log()

// Fail the command, not just report, so this cannot rot into a number nobody reads.
const broken = results.filter(
  (r) =>
    !r.state.shell ||
    r.uncaught.length > 0 ||
    r.state.degraded !== r.down.length ||
    r.state.vehicle === r.down.includes('remote-quote') ||
    r.state.account === r.down.includes('remote-account'),
)
if (broken.length > 0) {
  console.error('FAILED:', broken.map((r) => r.label).join(', '))
  process.exit(1)
}
console.log('All outage cases degrade exactly one panel per downed remote.')
