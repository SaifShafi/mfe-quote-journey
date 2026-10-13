# mfe-quote-journey

A micro frontend build: one host shell composing independently deployed remotes at
runtime with Webpack 5 Module Federation, React and TypeScript, with a NestJS
backend-for-frontend in front of it.

Built to learn the architecture by running it. Every number below comes from a
command in this README.

**Status: Stage 1.** A shell composing two independently built remotes over the
network, both drawing their controls from a federated singleton design-system
package. See [Roadmap](#roadmap).

## Why a quote journey

An insurance quote funnel is a small version of the problem micro frontends exist
to solve: several teams own consecutive steps of one journey, the steps need to
look like one product, and each team wants to deploy without waiting for the others.

## Architecture

```
host-shell     :3000   the frame. Owns layout, navigation, tokens, and (later) the session
remote-quote   :3001   vehicle details. Its own build, its own server, its own tests
remote-account :3002   policy summary. Same
shared-ui      -       button, input, panel. Consumed by all three as a federated singleton
shared-config  -       the one shared-module map all three webpack configs must agree on
```

The shell does not know its remotes at build time. At runtime it fetches each
`remoteEntry.js`, reads what that remote exposes, and loads the component. A remote
team deploys whenever it likes and the shell picks it up on the next page load, with
nobody rebuilding the shell.

Independent deploys buy a class of bug that only exists once the pieces are together.

## Run it

```bash
npm install
npm start          # all three apps, :3000 :3001 :3002
npm test           # Vitest unit tests
npm run build      # production build of all three
```

Then open <http://localhost:3000>.

## Proving the composition is real

These three checks show the remote is loaded over the network, not bundled into the
shell. All three are reproducible.

**1. The remote's code is not in the shell's bundle.**

```bash
npm run build
grep -rl "Year of manufacture" host-shell/dist/     # no output
grep -rl "Your current policy" host-shell/dist/     # no output
grep -rl "Year of manufacture" remote-quote/dist/   # matches
grep -rl "Your current policy" remote-account/dist/ # matches
```

**2. The shell resolves the remote by URL at runtime.**

```bash
grep -roh "localhost:300[12]/remoteEntry.js" host-shell/dist/ | sort -u
```

**3. Killing one remote's server degrades that step and nothing else.**

```bash
npm run measure:outage
```

Builds for production, then loads the composed page four times: both remotes up, each
one down, and both down. It asserts rather than reports, so it exits non-zero if any
case loses the shell, raises an uncaught error, or degrades a panel belonging to a
remote that is still up.

| Outage | Shell renders | Vehicle panel | Policy panel | Degraded panels | Uncaught page errors |
|---|---|---|---|---|---|
| both remotes up | yes | yes | yes | 0 | 0 |
| remote-quote down | yes | no | yes | 1 | 0 |
| remote-account down | yes | yes | no | 1 | 0 |
| both remotes down | yes | no | no | 2 | 0 |

By hand, the Stage 0 version still works: `lsof -ti:3001 | xargs kill`, reload `:3000`.
That is the failure a real estate actually hits.

## What the federated singleton actually buys

Stage 1 added a second remote and extracted `shared-ui` (button, input, panel) into a
package both remotes consume. The question the stage exists to answer is whether
declaring that package, and React, as federated singletons is worth the configuration.

Three webpack configs read their shared-module map from one place,
`shared-config/federation.js`, switched by `MFE_SHARED`. Every mode except `all` is a
deliberately broken build.

| Mode | What it does |
|---|---|
| `all` | the real configuration: React, React DOM and `shared-ui` all singletons |
| `no-ui` | `shared-ui` dropped from the shared map, so each remote bundles its own |
| `dup-react` | React still shared, but `singleton: false` |
| `none` | nothing shared at all |

### Bytes on disk

```bash
npm run measure:shared
```

| MFE_SHARED | What is shared | host-shell | remote-quote | remote-account | Total JS on disk | vs nothing shared |
|---|---|---|---|---|---|---|
| `none` | Nothing shared | 157.4 KB | 174.4 KB | 174.0 KB | 505.7 KB | 0.0 KB |
| `dup-react` | React shared but not a singleton | 169.9 KB | 179.9 KB | 179.5 KB | 529.4 KB | +23.7 KB |
| `no-ui` | React a singleton, shared-ui duplicated | 161.0 KB | 174.6 KB | 174.2 KB | 509.8 KB | +4.1 KB |
| `all` | React and shared-ui singletons | 169.5 KB | 179.0 KB | 178.6 KB | 527.1 KB | +21.4 KB |

Sharing makes the build **bigger**, by 21.4 KB. That is not a mistake in the
measurement. A webpack singleton still emits a fallback copy of every shared module
into every participant's output, plus the version-negotiation runtime, because any one
of them might be loaded standalone or might be the first to load. Three copies of
`shared-ui` exist on disk in the real configuration, and you can see them:

```bash
npm run build
grep -rl "sui-panel" host-shell/dist/ remote-quote/dist/ remote-account/dist/
```

So the disk number is the wrong number. It is published here because it is the one a
bundle-size check in CI would report, and it points the wrong way.

### Bytes the browser actually fetches

```bash
npm run measure:runtime
```

Builds each mode for production, serves all three on their real ports, and loads the
composed page once with a cold cache in headless Chromium. The react and react-dom
columns count copies of the implementation that were actually downloaded, found by
string-matching the response bodies rather than guessing from chunk names.

| MFE_SHARED | What is shared | host-shell | remote-quote | remote-account | JS fetched | vs nothing shared | react | react-dom | Both panels rendered |
|---|---|---|---|---|---|---|---|---|---|
| `none` | Nothing shared | 157.4 KB | 19.3 KB | 19.1 KB | 195.8 KB | 0.0 KB | 3 | 1 | no |
| `dup-react` | React shared but not a singleton | 22.3 KB | 156.5 KB | 12.5 KB | 191.2 KB | -4.6 KB | 1 | 1 | yes |
| `no-ui` | React a singleton, shared-ui duplicated | 25.0 KB | 151.9 KB | 15.8 KB | 192.7 KB | -3.2 KB | 1 | 1 | yes |
| `all` | React and shared-ui singletons | 21.8 KB | 156.0 KB | 12.0 KB | 189.8 KB | -6.0 KB | 1 | 1 | yes |

**The byte saving is 2.9 KB**, which is `no-ui` minus `all`: one fewer copy of
`shared-ui` fetched. That is the honest answer to "what does the shared package buy in
bytes" at this size, and it is close to nothing. `shared-ui` is three components. The
saving is per extra remote, so it scales with the number of teams and with the size of
the design system, and it is a real number rather than a large one.

Two details in that table are worth more than the byte column.

The first is **which origin serves React**. In every working mode the 130 KB of React
comes from `localhost:3001`, not from the host. Webpack resolves a tie in the shared
scope by comparing the providing application's name as a string, and `remote-quote`
sorts after `host-shell`. So the host's own framework arrives from a remote it did not
know about at build time. If that remote is slow, the shell is slow, and nothing in
the host's code says so.

The second is the `none` row: **three copies of React, and the page does not work.**

### What duplicated React actually looks like

With nothing shared, both remotes fail and the shell degrades to two fallback panels.
The error, quoted from `npm run measure:runtime`:

```
TypeError: Cannot read properties of null (reading 'useState')
    at t.useState (http://localhost:3001/152.js:2:11415)
    at s (http://localhost:3001/152.js:2:15884)
    at vo (http://localhost:3000/947.js:2:61166)
```

Read the origins in that stack. The failing frame is in the **remote's** bundle on
`:3001`, called from React DOM in the **host's** bundle on `:3000`. React's `useState`
reads `ReactCurrentDispatcher.current`, which React DOM sets on the React copy it was
built against. The host's React DOM set it on the host's React core, the remote called
its own, and that one's dispatcher is still `null`. There is no message that says
"duplicate React", and the word React does not appear in the error. This is what the
classic "Invalid hook call" warning looks like once it has been minified and spread
across two origins.

The chunk sizes say the rest: in `none` mode the remote fetches 19.3 KB and no vendor
chunk at all, because webpack put React DOM in the remote's *own entry* chunk group,
which a host consuming the container never loads. So the page runs three React cores
against one React DOM. Removing React from the shared map does not give you a slower
page. It gives you a broken one.

### `singleton: false` is not the same as duplicated

The `dup-react` row is the surprise, and it corrects something recorded during Stage 0.
Setting `singleton: false` on React produced **one** React copy and a working page.
Webpack's shared scope is keyed by version, so three applications all asking for
`^18.3.1` collapse to one entry whether or not `singleton` is set. `singleton: true` is
not what prevents the duplicate here. What it actually does is force a single copy
*when the versions differ*, warning instead of loading a second one.

So the config that bites is not `singleton: false`. It is version skew, and this repo
has not reproduced that yet. It is Stage 5's experiment, and the honest state today is
that the duplicate-React failure above was produced by removing React from the shared
map entirely, not by letting two versions coexist.

## Notes from building it

Things that cost time, recorded because the configuration is where this architecture
is difficult:

- **`publicPath` must be absolute on the remote.** The host fetches the remote's
  chunks by URL, so they cannot resolve against the host's origin. A relative
  `publicPath` gives you a remote that works standalone and 404s inside the shell.
- **The remote needs CORS on its dev server.** Different origin, so without
  `Access-Control-Allow-Origin` the host cannot read `remoteEntry.js` at all.
- **Both apps need an async boundary at the entry point.** `index.ts` dynamically
  imports `bootstrap.tsx` instead of importing it directly. Federation needs a tick to
  negotiate shared modules before anything imports React; importing statically gives
  the "Shared module is not available for eager consumption" error.
- **`singleton: true` on React is weaker than it looks.** Recorded in Stage 0 as "not
  optional", which the Stage 1 measurement above shows is wrong: with every
  application asking for the same version, `singleton: false` still resolves to one
  copy and the page works. The flag matters under version skew, not in general. What
  is genuinely not optional is having React in the shared map at all. Remove it and
  the page runs one React core per application, which is the failure quoted above.
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

  The dev server's runtime-error overlay covers the page when this happens, so a
  remote outage looks like a crashed shell even once the fallback is rendering
  correctly underneath. Locally you see the overlay. A customer would see the
  fallback. That is a monitoring problem as much as a UI one.
- **Design tokens are the cross-boundary contract, and nothing checks them.** The
  shell owns `tokens.css`; the remote's stylesheet contains no hard-coded colour or
  spacing value and reads everything through CSS custom properties. That is how a
  design system stays consistent across remotes that may not even share a framework,
  because custom properties cross framework boundaries and pierce shadow DOM where an
  imported theme object does not. Rename `--color-accent` in the shell and the remote
  does not fail to build. It renders with the browser's initial value. Same shape as
  the TypeScript problem below.
- **A visible hint inside a `<label>` becomes part of the input's accessible name.**
  Adding "(approximate)" next to "Annual mileage" changed the name to "Annual mileage
  (approximate)", which is noise for a screen reader user. The unit test asserting the
  accessible name caught it immediately. Fixed with `aria-describedby`, so the label is
  the name and the hint is a description, and a guard test now asserts the description
  separately.
- **A singleton does not make any bundle smaller.** It was easy to assume the point of
  `shared` is deduplication at build time. It is not: every participant emits a
  fallback copy, so the output grows. The deduplication happens when the browser
  decides which copy to fetch. A bundle-size budget in CI would read this backwards
  and reject the correct configuration.
- **Three webpack configs have to agree, and nothing makes them.** Webpack negotiates
  shared modules by name. If the host declares `shared-ui` a singleton and a remote
  does not declare it at all, nothing fails to compile and nothing warns. The map is
  therefore computed once in `shared-config/federation.js` and asserted in
  `shared-config/federation.test.ts`, because the failure has no build-time symptom
  and surfaces as a hook throwing somewhere unrelated.
- **A shared package is where an accessibility rule can finally be enforced.** The
  Stage 0 finding about a hint inside a `<label>` was fixed once, in one remote, by
  hand. It is now impossible to reintroduce: `shared-ui`'s `Input` wires the hint with
  `aria-describedby` and renders it outside the label, and the second remote got that
  behaviour without anyone telling its author the rule existed.
- **Hard-coded element ids are a bug that no remote's own tests can see.** Each remote
  renders alone in its own suite, so two remotes both using `id="year"` passes
  everywhere and fails only in the composed document. `shared-ui`'s `Input` uses
  `useId`, and `host-shell/src/composition.test.tsx` renders both remotes into one
  document and asserts no duplicate ids. That test imports the remotes' source
  directly, so it proves nothing about federation. It is the cheap half of a problem
  whose expensive half is Stage 2.
- **Heading level cannot be a remote's decision.** The shell owns the `<h1>`, and a
  remote cannot know how deep in the document it has been mounted. `Panel` takes a
  `headingLevel` and the shell passes it, because hard-coding `<h2>` is how you get a
  heading-order violation that exists only in the composed page.
- **A primitive has to own layout bugs its consumers cannot reach.** Two `Input`s side
  by side came out different heights, because the one with a hint made the grid track
  taller and its neighbour stretched to match. Only visible once two fields sat in a
  row, and not fixable from the consuming remote. Fixed with `align-content: start` in
  the package.
- **The remote's framework arrives from another remote.** Measured above: React is
  served from `:3001` in every working mode, because webpack breaks a tie in the
  shared scope on the providing application's name and `remote-quote` sorts after
  `host-shell`. Nothing in the host's configuration expresses that dependency, and it
  would change if a remote were renamed.
- **TypeScript cannot see across the boundary, and the gap grows per remote.**
  `host-shell/src/remotes.d.ts` is a hand-written declaration of each remote's
  contract. Nothing checks it against the remotes. If a remote changes its export and
  that file is not updated, the break appears at runtime in the composed app only.
  Two remotes means two such declarations, and the cost is linear in the number of
  teams. That file is the contract. Keeping it honest is process, not types.

## Roadmap

- [x] **Stage 0.** Host plus one remote, composing at runtime. Vitest unit tests
- [x] **Stage 1.** Second remote, shared component package as a federated singleton,
      duplicate-React cost measured
- [ ] **Stage 2.** Cross-remote state handled deliberately. Playwright integration
      stage in CI running axe against the *composed* page, not each remote alone
- [ ] **Stage 3.** NestJS BFF: aggregation, caching, holds the session token
- [ ] **Stage 4.** Lazy loading and code splitting, measured against time to interactive
- [ ] **Stage 5.** Independent deploy per remote, and a deliberate version-skew failure

## Measurements

Filled in as each stage lands. Nothing is quoted here that was not measured by a
command in this file.

| What | Result | Stage | Command |
|---|---|---|---|
| Remote code present in host bundle | None | 0 | `grep -rl` above |
| Shell survives a dead remote | Yes, degraded panel, no uncaught error | 0 | `npm run measure:outage` |
| One remote down costs exactly one panel | Yes, in all four outage cases | 1 | `npm run measure:outage` |
| Total JS on disk, everything shared | 527.1 KB | 1 | `npm run measure:shared` |
| Total JS on disk, nothing shared | 505.7 KB | 1 | `npm run measure:shared` |
| Cost of sharing, on disk | +21.4 KB | 1 | `npm run measure:shared` |
| JS fetched by the composed page, everything shared | 189.8 KB | 1 | `npm run measure:runtime` |
| What the `shared-ui` singleton saves, fetched | 2.9 KB | 1 | `npm run measure:runtime` |
| React copies fetched, everything shared | 1 | 1 | `npm run measure:runtime` |
| React copies fetched, nothing shared | 3, and the page does not work | 1 | `npm run measure:runtime` |
| React copies fetched, `singleton: false` | 1, and the page works | 1 | `npm run measure:runtime` |
| Unit tests | 24 passing | 1 | `npm test` |

## AI workflow

Built with Claude Code in supervised review-every-action mode. Corrections that were
needed:

- The initial `tsconfig` carried `noEmit: true` in the shared base, which left
  `ts-loader` emitting nothing and the build failing with "TypeScript emitted no
  output". The apps now override it, since the bundler is what compiles.
- `ts-loader` was type-checking `*.test.tsx` during the webpack build and failing on
  jest-dom matchers it had no types for. Tests are run by Vitest and are now excluded
  from the bundle.
- Stage 1's first reading of the `none` failure was wrong, and it was wrong in the
  direction that sounds more expert. The stack trace was read as webpack handing the
  remote a null module, when the null is React's own dispatcher and the error is the
  ordinary duplicate-React failure. Caught by checking which chunk actually contained
  React core instead of reasoning from the chunk graph. The claim and the check
  disagreed, and the check was right.
- The Stage 0 note calling `singleton: true` "not optional" survived into Stage 1
  before it was measured, at which point `singleton: false` turned out to produce one
  React copy and a working page. It is corrected in place above rather than deleted,
  since a plausible claim that nobody had run is the thing this repo exists to catch.
- The duplicate-React error could not be captured from a unit test, so Stage 1 pulled
  Playwright forward from Stage 2 to drive a real browser. The measurement scripts use
  it directly; the test suite in Stage 2 will use the runner.
- Playwright is pinned to 1.52, not latest. 1.55 and later require Node 20 and this
  machine runs Node 18.

## Licence

MIT
