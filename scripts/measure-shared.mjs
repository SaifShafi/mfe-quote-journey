#!/usr/bin/env node
/**
 * Stage 1 measurement: what does a federated singleton actually buy?
 *
 * Builds all three applications once per sharing mode and reports the bytes on
 * disk. Run with:
 *
 *   npm run measure:shared
 *
 * The last build is always the real one ("all"), so running this leaves dist/
 * in the same state npm run build would.
 *
 * Read the output with care. Bytes on disk are not bytes over the wire: a
 * webpack singleton still emits a fallback copy of the shared module into every
 * participant's output, and only the copy belonging to whichever application
 * wins the negotiation is ever fetched. The disk number understates the saving
 * and the network number is measured separately. Both are in the README.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['host-shell', 'remote-quote', 'remote-account']

// "all" runs last so the working tree is left with the real build.
const MODES = [
  ['none', 'Nothing shared'],
  ['dup-react', 'React shared but not a singleton'],
  ['no-ui', 'React a singleton, shared-ui duplicated'],
  ['all', 'React and shared-ui singletons'],
]

function jsBytes(app) {
  const dir = join(root, app, 'dist')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .reduce((total, f) => total + statSync(join(dir, f)).size, 0)
}

function build(mode) {
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    env: { ...process.env, MFE_SHARED: mode },
    stdio: 'pipe',
  })
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

const rows = []
for (const [mode, label] of MODES) {
  process.stderr.write(`building MFE_SHARED=${mode}\n`)
  build(mode)
  const perApp = Object.fromEntries(APPS.map((a) => [a, jsBytes(a)]))
  const total = Object.values(perApp).reduce((a, b) => a + b, 0)
  rows.push({ mode, label, perApp, total })
}

const baseline = rows.find((r) => r.mode === 'none').total

console.log()
console.log(
  `| MFE_SHARED | What is shared | ${APPS.join(' | ')} | Total JS on disk | vs nothing shared |`,
)
console.log(`|---|---|${APPS.map(() => '---|').join('')}---|---|`)
for (const r of rows) {
  const delta = r.total - baseline
  const sign = delta === 0 ? '' : delta < 0 ? '-' : '+'
  const cells = APPS.map((a) => kb(r.perApp[a])).join(' | ')
  console.log(
    `| \`${r.mode}\` | ${r.label} | ${cells} | ${kb(r.total)} | ${sign}${kb(Math.abs(delta))} |`,
  )
}
console.log()
console.log('Bytes on disk only. See the README for bytes actually fetched.')
