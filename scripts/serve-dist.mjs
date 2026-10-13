#!/usr/bin/env node
/**
 * Serves the production builds, which the webpack dev servers do not: they
 * compile in development mode. The network measurement has to run against the
 * same bytes a user would get.
 *
 *   node scripts/serve-dist.mjs
 *
 * CORS is wide open for the same reason the remotes' dev servers set it: the
 * host reads remoteEntry.js from a different origin.
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// MFE_SKIP names apps NOT to serve, which is how an outage is simulated: a
// remote that is down is a port with nothing listening on it, not a port
// returning an error.
const skip = (process.env.MFE_SKIP ?? '').split(',').filter(Boolean)

const APPS = [
  ['host-shell', 3000],
  ['remote-quote', 3001],
  ['remote-account', 3002],
].filter(([app]) => !skip.includes(app))

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

for (const [app, port] of APPS) {
  const dir = join(root, app, 'dist')

  createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    const file = join(dir, path === '/' ? 'index.html' : path)

    res.setHeader('Access-Control-Allow-Origin', '*')
    // No caching, so a measurement run cannot be contaminated by the previous one.
    res.setHeader('Cache-Control', 'no-store')

    let size
    try {
      size = statSync(file).size
    } catch {
      res.writeHead(404).end('not found')
      return
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': size,
    })
    createReadStream(file).pipe(res)
  }).listen(port, () => console.log(`${app} on http://localhost:${port}`))
}
