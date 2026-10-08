# mfe-quote-journey

A micro frontend build: one host shell composing independently deployed remotes at
runtime with Webpack 5 Module Federation, React and TypeScript, with a NestJS
backend-for-frontend in front of it.

Built to understand the architecture first-hand rather than from documentation, and
measured as it goes. Every number below is produced by a command in this README.

**Status: Stage 0.** Host and one remote composing over the network. See
[Roadmap](#roadmap) for what is and is not done yet.

## Why a quote journey

An insurance quote funnel is the clearest small example of the problem micro
frontends exist to solve: several teams own consecutive steps of one journey, the
steps need to look like one product, and each team wants to deploy without waiting
for the others.

## Architecture

```
host-shell     :3000   the frame. Owns layout, navigation, and (later) the session
remote-quote   :3001   vehicle details. Its own build, its own server, its own tests
```

The shell has **no build-time knowledge** of the remote. At runtime it fetches
`http://localhost:3001/remoteEntry.js`, reads what that remote exposes, and loads the
component. The remote team deploys whenever they like and the shell picks it up on
the next page load, with nobody rebuilding the shell.

That is the whole trade, and it is paid for with a class of bug that only exists once
the pieces are together.

## Run it

```bash
npm install
npm start          # both apps, :3000 and :3001
npm test           # Vitest unit tests
npm run build      # production build of both
```

Then open <http://localhost:3000>.

## Proving the composition is real

A federated host is easy to confuse with an app that merely code-splits. Three checks
distinguish them, and all three are reproducible:

**1. The remote's code is not in the shell's bundle.**

```bash
npm run build
grep -rl "Year of manufacture" host-shell/dist/   # no output
grep -rl "Year of manufacture" remote-quote/dist/ # matches
```

**2. The shell resolves the remote by URL at runtime.**

```bash
grep -roh "localhost:3001/remoteEntry.js" host-shell/dist/
```

**3. Killing the remote's server degrades that step and nothing else.**

Stop the process on `:3001`, reload `:3000`. The shell still renders; the vehicle step
is replaced by its fallback. If the whole page dies, the error boundary is wrong. If
nothing changes, the composition was never happening over the network.

That third check is the one worth keeping. It is the only one that tests the failure
mode a real estate actually hits.

## Notes from building it

Things that cost time, recorded because the configuration is where this architecture
is actually difficult:

- **`publicPath` must be absolute on the remote.** The host fetches the remote's
  chunks by URL, so they cannot resolve against the host's origin. A relative
  `publicPath` gives you a remote that works standalone and 404s inside the shell.
- **The remote needs CORS on its dev server.** Different origin, so without
  `Access-Control-Allow-Origin` the host cannot read `remoteEntry.js` at all.
- **Both apps need an async boundary at the entry point.** `index.ts` dynamically
  imports `bootstrap.tsx` instead of importing it directly. Federation needs a tick to
  negotiate shared modules before anything imports React; importing statically gives
  the "Shared module is not available for eager consumption" error.
- **`singleton: true` on React is not optional.** Without it the page can end up with
  two React instances and two module registries, and the symptom is hooks throwing or
  context reading as undefined under a provider that is visibly mounted.
- **A dead remote fails in a phase React cannot see, and an error boundary alone
  does not cover it.** This was the one real surprise. Stopping the remote's server
  produces a `ScriptExternalLoadError` thrown inside webpack's shared-scope
  initialisation (`__webpack_require__.I`, by way of
  `webpack/sharing/consume/default/react/react`), because before the host can
  resolve its *own* shared React it initialises the remote containers to negotiate
  versions. That is a promise rejection during module loading, not an error during
  render, so a React error boundary is the wrong instrument on its own. The fix is to
  catch the rejection at the dynamic `import()` and resolve it to a fallback
  component, and keep the boundary for failures after the module has loaded. Two
  phases, two mechanisms.

  Worth noting separately: the dev server's runtime-error overlay covers the page
  when this happens, so a remote outage looks like a crashed shell even once the
  fallback is rendering correctly underneath. In a real estate that is a monitoring
  problem as much as a UI one, because the thing you see locally is not the thing
  your customer sees.
- **Design tokens are the cross-boundary contract, and nothing checks them.** The
  shell owns `tokens.css`; the remote's stylesheet contains no hard-coded colour or
  spacing value and reads everything through CSS custom properties. That is how a
  design system stays consistent across remotes that may not even share a framework,
  because custom properties cross framework boundaries and pierce shadow DOM where an
  imported theme object does not. The cost is symmetrical with the TypeScript problem
  below: rename `--color-accent` in the shell and the remote does not fail to build,
  it quietly renders with the browser's initial value.
- **A visible hint inside a `<label>` becomes part of the input's accessible name.**
  Adding "(approximate)" next to "Annual mileage" changed the name to "Annual mileage
  (approximate)", which is noise for a screen reader user. The unit test asserting the
  accessible name caught it immediately. Fixed with `aria-describedby`, so the label is
  the name and the hint is a description, and a guard test now asserts the description
  separately.
- **TypeScript cannot see across the boundary.** `host-shell/src/remotes.d.ts` is a
  hand-written declaration of the remote's contract. Nothing checks it against the
  remote. If the remote changes its export and that file is not updated, the break
  appears at runtime in the composed app only. That file *is* the contract, and
  keeping it honest is a process problem rather than a type problem.

## Roadmap

- [x] **Stage 0.** Host plus one remote, composing at runtime. Vitest unit tests
- [ ] **Stage 1.** Second remote, shared component package as a federated singleton,
      duplicate-React cost measured
- [ ] **Stage 2.** Cross-remote state handled deliberately. Playwright integration
      stage in CI running axe against the *composed* page, not each remote alone
- [ ] **Stage 3.** NestJS BFF: aggregation, caching, holds the session token
- [ ] **Stage 4.** Lazy loading and code splitting, measured against time to interactive
- [ ] **Stage 5.** Independent deploy per remote, and a deliberate version-skew failure

## Measurements

Filled in as each stage lands. Nothing is quoted here that was not measured by a
command in this file.

| What | Result | Stage |
|---|---|---|
| Remote code present in host bundle | None | 0 |
| Shell survives a dead remote | Yes, degraded panel, no uncaught error | 0 |
| Host bundle | 168 KB | 0 |
| Remote bundle | 184 KB | 0 |
| Unit tests | 3 passing | 0 |

## AI workflow

Built with Claude Code in supervised review-every-action mode. Corrections that were
needed, recorded honestly rather than tidied away:

- The initial `tsconfig` carried `noEmit: true` in the shared base, which left
  `ts-loader` emitting nothing and the build failing with "TypeScript emitted no
  output". The apps now override it, since the bundler is what compiles.
- `ts-loader` was type-checking `*.test.tsx` during the webpack build and failing on
  jest-dom matchers it had no types for. Tests are run by Vitest and are now excluded
  from the bundle.

## Licence

MIT
