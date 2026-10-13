#!/usr/bin/env node
/**
 * Stage 2 measurement: run axe twice, against each remote in isolation and
 * against the shell with that remote mounted, and report both numbers. Run
 * with:
 *
 *   npm run measure:axe
 *
 * The isolated run is each remote's own standalone page, served at its own
 * port with no shell chrome at all. The composed run is the shell's actual
 * route for that remote: shell header, step nav and page copy, plus the one
 * remote. That is the real comparison this stage exists to make: what does
 * composition cost, not what does the remote cost on its own.
 *
 * Both remotes never share one page any more (Stage 2 split them into their
 * own routes, /vehicle and /cover), so there is no single "every remote
 * mounted" page left to scan. Running the composed check once per route, per
 * remote, is the honest replacement: it isolates exactly what the SHELL adds
 * around each remote, without conflating two different remotes' issues into
 * one number.
 */
import { execFileSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
  { label: 'remote-quote, standalone', url: 'http://localhost:3001/' },
  {
    label: 'remote-quote, composed (shell /vehicle)',
    url: 'http://localhost:3000/vehicle',
  },
  { label: 'remote-account, standalone', url: 'http://localhost:3002/' },
  {
    label: 'remote-account, composed (shell /cover)',
    // With the registration present, so the composed run also scans the
    // journey-context banner Stage 2 added, not just the bare panel.
    url: 'http://localhost:3000/cover?registration=AB12CDE&year=2019',
  },
]

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: root, stdio: 'pipe' })
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

process.stderr.write('building\n')
run('npm', ['run', 'build'])

const staticServer = await serveStatic()
const bffServer = await serveBff()
const browser = await chromium.launch()

const results = []
for (const target of TARGETS) {
  const page = await (await browser.newContext()).newPage()
  await page.goto(target.url, { waitUntil: 'networkidle' })
  const { violations } = await new AxeBuilder({ page }).analyze()
  results.push({ ...target, violations })
  await page.close()
}

await browser.close()
staticServer.kill()
bffServer.kill()

console.log()
console.log('| Target | Violations | Rule ids |')
console.log('|---|---|---|')
for (const r of results) {
  const ids = r.violations.map((v) => v.id).join(', ') || '—'
  console.log(`| ${r.label} | ${r.violations.length} | ${ids} |`)
}

console.log()
for (const r of results) {
  if (r.violations.length === 0) continue
  console.log(`### ${r.label}`)
  for (const v of r.violations) {
    console.log(`- **${v.id}** (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
    for (const node of v.nodes) {
      console.log(`  - ${node.target.join(' ')}`)
    }
  }
  console.log()
}
