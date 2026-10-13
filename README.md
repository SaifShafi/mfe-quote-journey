# mfe-quote-journey

A micro frontend build: one host shell composing independently deployed remotes at
runtime with Webpack 5 Module Federation, React and TypeScript, with a NestJS
backend-for-frontend in front of it.

Built to learn the architecture by running it. Every number below comes from a
command in this README.

**Status: Stage 3.** A NestJS backend-for-frontend aggregates what both remotes need
into one call, caches it, and holds the session. See [Roadmap](#roadmap).

## Why a quote journey

An insurance quote funnel is a small version of the problem micro frontends exist
to solve: several teams own consecutive steps of one journey, the steps need to
look like one product, and each team wants to deploy without waiting for the others.

## Architecture

```
host-shell     :3000   the frame. Owns layout, navigation, tokens, and the session
remote-quote   :3001   vehicle details. Its own build, its own server, its own tests
remote-account :3002   policy summary. Same
bff            :4000   NestJS. Aggregates both remotes' data, caches it, holds the session
shared-ui      -       button, input, panel. Consumed by all three as a federated singleton
shared-config  -       the one shared-module map all three webpack configs must agree on
```

The shell does not know its remotes at build time. At runtime it fetches each
`remoteEntry.js`, reads what that remote exposes, and loads the component. A remote
team deploys whenever it likes and the shell picks it up on the next page load, with
nobody rebuilding the shell.

Independent deploys buy a class of bug that only exists once the pieces are together.

The shell is also the only thing that talks to the bff. A remote receives resolved
data as props; it never calls `:4000` and never holds the token that did. See
[what the BFF boundary buys](#what-the-bff-boundary-buys) below.

## Run it

```bash
npm install
npm start          # all four apps, :3000 :3001 :3002 :4000
npm test           # Vitest unit tests, including the bff's
npm run build      # production build of the three frontend apps
```

Then open <http://localhost:3000>. The bff runs straight off its TypeScript source
via `ts-node`; no build step needed in dev.

## Proving the composition is real

These checks show the remote is loaded over the network, not bundled into the shell,
and that the BFF holds what it is supposed to hold. All are reproducible.

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

**4. No remote's bundle contains the access token.**

```bash
npm run build
grep -rl "accessToken" remote-quote/dist/ remote-account/dist/   # no output
grep -rl "accessToken" host-shell/dist/                          # matches
```

The host calls the bff and holds the token in `fetchJourney`'s own call stack; a
remote only ever receives the vehicle and policy data that call resolved to, as plain
props. This is the Stage 3 analogue of the Stage 0/1 bundle checks: the host's code
can be read for what it imports, but what a remote never receives has to be proven by
grepping for its absence.

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
| `none` | Nothing shared | 158.4 KB | 174.4 KB | 174.2 KB | 507.0 KB | 0.0 KB |
| `dup-react` | React shared but not a singleton | 171.0 KB | 180.0 KB | 179.7 KB | 530.7 KB | +23.7 KB |
| `no-ui` | React a singleton, shared-ui duplicated | 162.0 KB | 174.7 KB | 174.4 KB | 511.1 KB | +4.1 KB |
| `all` | React and shared-ui singletons | 170.5 KB | 179.1 KB | 178.8 KB | 528.4 KB | +21.4 KB |

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
| `none` | Nothing shared | 158.4 KB | 19.4 KB | 19.2 KB | 197.0 KB | 0.0 KB | 3 | 1 | no |
| `dup-react` | React shared but not a singleton | 23.3 KB | 156.5 KB | 12.6 KB | 192.4 KB | -4.6 KB | 1 | 1 | yes |
| `no-ui` | React a singleton, shared-ui duplicated | 26.1 KB | 151.9 KB | 15.8 KB | 193.9 KB | -3.1 KB | 1 | 1 | yes |
| `all` | React and shared-ui singletons | 22.9 KB | 156.0 KB | 12.1 KB | 191.0 KB | -6.0 KB | 1 | 1 | yes |

**The byte saving is 2.9 KB** (`193.9 - 191.0`), which is `no-ui` minus `all`: one fewer copy of
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
    at s (http://localhost:3001/152.js:2:15901)
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

## What the BFF boundary buys

Stage 3 added `bff/` on `:4000`: a NestJS app that aggregates what both remotes need
into one response, caches it, and holds the session. The shell is its only caller.

### Where the boundary was drawn, and why

- **What it does.** `GET /journey` calls a vehicle service and an account service in
  parallel and merges their responses. Nothing about a premium, eligibility, or any
  other decision lives here: `journey.service.ts` reshapes two records into one, full
  stop. The services it calls are stand-ins (`bff/src/downstream/`), each with an
  artificial delay, because a learning repo's own localhost round trip is sub-millisecond
  and would make an aggregation measurement meaningless without one.
- **What it holds.** The session. An access token is a short-lived JWT (10 seconds, so
  this repo's own tests can exercise expiry without a real wait) returned to the host in
  a response body. A refresh token is a long-lived, server-held opaque string, set as an
  httpOnly cookie scoped to `/auth/refresh` alone, rotated on every use so a stolen one
  is only replayable once. No remote ever sees either; see the fourth composition check
  above.
- **What it caches.** The aggregated response, in an in-memory `Map` with a TTL
  (`bff/src/cache/ttl-cache.ts`), keyed by session subject. No Redis: this BFF is one
  process serving a demo session, and a cache that does not survive a restart or scale
  past one instance is the honest cost of that, written down rather than hidden behind
  a dependency that implies more durability than exists.
- **What it does not do.** There is no real identity provider yet. `POST /auth/session`
  issues a session to whoever asks, which is deliberate: Stage 5 is OIDC through this
  same BFF, and the session and token machinery is shaped so that stage only has to
  replace how a session *starts*, not how it is held afterwards.

### Round trips, before and after aggregation

```bash
npm run measure:bff
```

Rebuilds `host-shell` twice with `BFF_MODE` baked in by webpack's `DefinePlugin`, the
same switch Stage 1 uses for `MFE_SHARED`: `split` calls the two downstream endpoints
the host would have to call directly without an aggregator; `aggregated` calls
`/journey` once. Both are measured against a live bff, not a static mock.

| BFF_MODE | What it does | Requests to the bff | Round trips | Wall clock |
|---|---|---|---|---|
| `split` | No aggregator: one request per remote plus one for the session | `POST /auth/session`, `GET /downstream/vehicle`, `GET /downstream/account` | 3 | ~700ms |
| `aggregated` | The real BFF: one request for the session, one for the journey | `POST /auth/session`, `GET /journey` | 2 | ~690ms |

**Aggregation saves one round trip**, from 3 to 2. It would save more with a third
remote: the session call is fixed, but every additional remote's data is one more
request under `split` and zero more under `aggregated`, since the BFF fans out
server-to-server instead. The wall-clock numbers above are close enough together,
and noisy enough run to run on a dev machine, that the honest reading is "within
noise": the two downstream calls run in parallel under `split` too, so this one BFF
saves a round trip without saving meaningful time. The round-trip count is the number
this stage is actually about, and the one that would keep growing without an
aggregator as more remotes join.

### The cache, proven, not asserted

The same run reloads the composed page twice inside the 5-second journey cache TTL:

```
X-Cache on load 1 (fresh session, fresh cache): MISS
X-Cache on load 2 (new session, same cache key): HIT
```

The second load starts an entirely new session (a new access token, a new refresh
cookie) and still gets a cache hit, because the cache is keyed by subject and this
demo has exactly one. `bff/src/journey/journey.service.test.ts` has the same proof at
the unit level, including that a cache hit does not call either downstream service
again, and that the cache expires on schedule.

### A BFF outage is additive, not load-bearing

Kill the bff (`lsof -ti:4000 | xargs kill`) and reload `:3000`. Both panels still
render, with the same defaults they would use standalone: `App.tsx` treats the BFF
call as an enhancement and mounts the remotes with no initial props at all if it
fails, which is the one case where a remote's own built-in stub data is not just a
standalone convenience but the real fallback path. The console carries the error
(`[shell] bff journey fetch failed, remotes will use their own defaults`); the page
does not. Same shape as a dead remote in Stage 0, one layer further out.

Both remotes still mount with no initial props when the fetch fails, and each one's
own built-in default takes over. `initialVehicle` and `initialPolicy` are optional
props specifically so that path exists: a required prop would have forced a choice
between blocking the whole page on the BFF or inventing a second set of placeholder
data the shell would own instead of the remote.

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
- **Nest's type-based dependency injection needs `tsc`, and Vitest does not give it
  one.** `emitDecoratorMetadata` is what lets Nest resolve `constructor(private x:
  Service)` by reading the parameter's type. Vitest transforms TypeScript with esbuild,
  and esbuild does not implement that compiler option at all, by its own documented
  design. The result was not a build error: every controller and guard compiled and
  bootstrapped cleanly, and every injected dependency was silently `undefined` the
  first time a route handler touched it. The fix is explicit `@Inject(Service)` on
  every constructor parameter the DI container resolves, which stores its own metadata
  and does not depend on `emitDecoratorMetadata` at all. It is more typing than the
  implicit form, and it is also the only form that behaves identically whether the
  code runs under `ts-node` (which does have the real compiler) or under Vitest's
  esbuild transform, so the two no longer have two different stories.
- **An object made for chaining breaks a hook's strict return type.** `vi.useFakeTimers()`
  returns the `vi` object itself so calls can be chained, which means
  `beforeEach(() => vi.useFakeTimers())` returns that object from the arrow function,
  and Vitest's hook types expect `void`. `noUnusedLocals`-style strictness caught it at
  typecheck, not at the point you would reflexively look: wrapping the call in braces
  so the arrow function has no implicit return is the fix.

## Roadmap

- [x] **Stage 0.** Host plus one remote, composing at runtime. Vitest unit tests
- [x] **Stage 1.** Second remote, shared component package as a federated singleton,
      duplicate-React cost measured
- [ ] **Stage 2.** Cross-remote state handled deliberately. Playwright integration
      stage in CI running axe against the *composed* page, not each remote alone.
      Built out of order, after Stage 3: Playwright is already in the repo as a
      measurement-script dependency, so this stage is mostly wiring a runner and a
      CI job around a tool that is already proven to work here.
- [x] **Stage 3.** NestJS BFF: aggregation, caching, holds the session token
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
| Total JS on disk, everything shared | 528.4 KB | 1 | `npm run measure:shared` |
| Total JS on disk, nothing shared | 507.0 KB | 1 | `npm run measure:shared` |
| Cost of sharing, on disk | +21.4 KB | 1 | `npm run measure:shared` |
| JS fetched by the composed page, everything shared | 191.0 KB | 1 | `npm run measure:runtime` |
| What the `shared-ui` singleton saves, fetched | 2.9 KB | 1 | `npm run measure:runtime` |
| React copies fetched, everything shared | 1 | 1 | `npm run measure:runtime` |
| React copies fetched, nothing shared | 3, and the page does not work | 1 | `npm run measure:runtime` |
| React copies fetched, `singleton: false` | 1, and the page works | 1 | `npm run measure:runtime` |
| bff requests, no aggregation | 3 (session, vehicle, account) | 3 | `npm run measure:bff` |
| bff requests, aggregated | 2 (session, journey) | 3 | `npm run measure:bff` |
| Round trips saved by aggregation | 1 | 3 | `npm run measure:bff` |
| Journey cache, back-to-back loads | MISS then HIT | 3 | `npm run measure:bff` |
| Access token present in a remote's bundle | None | 3 | `grep -rl` above |
| Unit tests | 57 passing | 3 | `npm test` |

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
- The bff's DI silently handed every controller and guard an `undefined` service, with
  no error anywhere: not at compile time, not at Nest's bootstrap, only the first time
  a route touched the dependency. The cause was Vitest transforming TypeScript with
  esbuild, which does not emit `emitDecoratorMetadata`, so Nest had no type information
  to resolve constructor parameters by. Fixed with explicit `@Inject()` tokens on every
  injected constructor parameter, which do not depend on that compiler output.
- `tsx` was the first choice for running the bff's TypeScript without a build step, on
  the model of `ts-node` being heavier. It fails outright on this machine's Node 18 with
  `E.toReversed is not a function`, an ES2023 array method Node did not have until 20,
  used somewhere in tsx's own config-loading code. Replaced with `ts-node`, which also
  fixed the decorator-metadata gap above for the dev runtime specifically, since it
  runs the real TypeScript compiler rather than esbuild.
- Stage 1's measurement numbers in this README needed regenerating once Stage 3 added
  `host-shell/src/bff.ts`: the host's own bundle grew by roughly a kilobyte, which
  shifted every host-shell cell in both Stage 1 tables even though nothing about
  sharing changed. The non-negotiable rule that a number must come from a command in
  this file means a later stage touching an earlier stage's bundle obligates a rerun,
  not a note explaining why the old number is "close enough".

## Licence

MIT
