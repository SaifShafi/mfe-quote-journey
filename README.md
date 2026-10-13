# mfe-quote-journey

A micro frontend build: one host shell composing independently deployed remotes at
runtime with Webpack 5 Module Federation, React and TypeScript, with a NestJS
backend-for-frontend in front of it.

Built to learn the architecture by running it. Every number below comes from a
command in this README.

**Status: Stage 4.** Each route fetches only the data it needs, when it is actually
visited, and the shell's own route code is split the same way. See
[Roadmap](#roadmap).

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
npm run test:e2e   # Playwright against the composed page, plus the axe gate
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

Builds for production, then loads both routes, for each of four outage cases: both
remotes up, each one down, and both down. Each remote now lives on its own route
(`/vehicle`, `/cover`; see the routing section below), so the check visits both and
confirms a downed remote degrades its own route only, regardless of what the other
remote is doing. It asserts rather than reports, so it exits non-zero if any case
loses the shell, raises an uncaught error, or degrades a route whose remote is up.

| Outage | /vehicle shell | /vehicle panel | /vehicle degraded | /cover shell | /cover panel | /cover degraded | Uncaught errors |
|---|---|---|---|---|---|---|---|
| both remotes up | yes | yes | 0 | yes | yes | 0 | 0 |
| remote-quote down | yes | no | 1 | yes | yes | 0 | 0 |
| remote-account down | yes | yes | 0 | yes | no | 1 | 0 |
| both remotes down | yes | no | 1 | yes | no | 1 | 0 |

By hand, the Stage 0 version still works: `lsof -ti:3001 | xargs kill`, reload `:3000`.
That is the failure a real estate actually hits.

**4. No remote's bundle contains the access token.**

```bash
npm run build
grep -rl "accessToken" remote-quote/dist/ remote-account/dist/   # no output
grep -rl "accessToken" host-shell/dist/                          # matches
```

The host calls the bff and holds the token inside `host-shell/src/bff.ts`'s own
module scope; a remote only ever receives the vehicle or policy data that call
resolved to, as a plain prop. This is the Stage 3 analogue of the Stage 0/1 bundle
checks: the host's code can be read for what it imports, but what a remote never
receives has to be proven by grepping for its absence.

**5. The shell's own route code is split too, not just the remotes'.**

```bash
npm run build
grep -l "Fetching your vehicle" host-shell/dist/*.js  # one chunk
grep -l "Fetching your policy" host-shell/dist/*.js   # a different chunk
```

`VehicleStep.tsx` and `CoverStep.tsx` are each `React.lazy`-imported from `App.tsx`
(Stage 4), so the code that knows how to load `remote_quote` and the code that knows
how to load `remote_account` are never in the same file the browser downloads.
Visiting `/vehicle` never fetches the chunk that only `/cover` needs, and vice versa.

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
| `none` | Nothing shared | 187.8 KB | 175.4 KB | 175.2 KB | 538.5 KB | 0.0 KB |
| `dup-react` | React shared but not a singleton | 197.2 KB | 181.0 KB | 180.8 KB | 559.0 KB | +20.5 KB |
| `no-ui` | React a singleton, shared-ui duplicated | 191.0 KB | 175.7 KB | 175.4 KB | 542.2 KB | +3.7 KB |
| `all` | React and shared-ui singletons | 196.8 KB | 180.1 KB | 179.8 KB | 556.7 KB | +18.3 KB |

Sharing makes the build **bigger**, by 18.3 KB. That is not a mistake in the
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

Builds each mode for production, serves all three on their real ports, and visits the
whole journey with a cold cache: `/vehicle`, then a client-side navigation to `/cover`,
the same two steps a real user takes. The react and react-dom columns count copies of
the implementation that were actually downloaded, found by string-matching the
response bodies rather than guessing from chunk names.

| MFE_SHARED | What is shared | host-shell | remote-quote | remote-account | JS fetched | vs nothing shared | react | react-dom | Both routes rendered |
|---|---|---|---|---|---|---|---|---|---|
| `none` | Nothing shared | 187.8 KB | 19.4 KB | 19.2 KB | 226.4 KB | 0.0 KB | 3 | 1 | no |
| `dup-react` | React shared but not a singleton | 49.5 KB | 156.5 KB | 12.6 KB | 218.6 KB | -7.8 KB | 1 | 1 | yes |
| `no-ui` | React a singleton, shared-ui duplicated | 55.1 KB | 151.9 KB | 15.8 KB | 222.9 KB | -3.6 KB | 1 | 1 | yes |
| `all` | React and shared-ui singletons | 49.1 KB | 156.0 KB | 12.1 KB | 217.2 KB | -9.2 KB | 1 | 1 | yes |

**The byte saving is 5.7 KB** (`222.9 - 217.2`), which is `no-ui` minus `all`: one fewer
copy of `shared-ui` fetched across the whole two-step journey. Bigger than Stage 2's own
reading of this number (2.4 KB), because Stage 4's own code splitting changed how much
of `host-shell`'s bundle loads at all before `/cover` is reached, which shifts chunk
boundaries this comparison is sensitive to. That is the honest answer to "what does the
shared package buy in bytes" at this size, still closer to nothing than to a lot:
`shared-ui` is three components. The saving is per extra remote, so it scales with the
number of teams and with the size of the design system, and it is a real number rather
than a large one.

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
    at vo (http://localhost:3000/396.js:2:70135)
```

Read the origins in that stack. The failing frame is in the **remote's** bundle on
`:3001`, called from React DOM in the **host's** bundle on `:3000`. React's `useState`
reads `ReactCurrentDispatcher.current`, which React DOM sets on the React copy it was
built against. The host's React DOM set it on the host's React core, the remote called
its own, and that one's dispatcher is still `null`. There is no message that says
"duplicate React", and the word React does not appear in the error. This is what the
classic "Invalid hook call" warning looks like once it has been minified and spread
across two origins.

The chunk sizes say the rest: in `none` mode remote-quote fetches 19.4 KB and no
vendor chunk at all, because webpack put React DOM in the remote's *own entry* chunk
group, which a host consuming the container never loads. So the page runs three React
cores against one React DOM. Removing React from the shared map does not give you a
slower page. It gives you a broken one.

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
`/journey` once. Both are measured against a live bff, not a static mock. Stage 4 added
a second switch, `LAZY_MODE`, and this comparison only means anything when it is
`eager` (the shape where something calls `/journey` at all), so the script forces it;
see [what fetching per route costs and buys](#what-fetching-per-route-costs-and-buys)
below.

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

Kill the bff (`lsof -ti:4000 | xargs kill`) and visit either route. Both `/vehicle` and
`/cover` still render, with the same defaults their remote would use standalone: each
step component (`VehicleStep.tsx`, `CoverStep.tsx`) treats its own bff call as an
enhancement and mounts its remote with no initial prop at all if that call fails, which
is the one case where a remote's own built-in stub data is not just a standalone
convenience but the real fallback path. The console carries the error (`[shell] bff
vehicle fetch failed, remote will use its own defaults`, or the policy equivalent on
`/cover`); the page does not. Same shape as a dead remote in Stage 0, one layer further
out.

`initialVehicle` and `initialPolicy` are optional props specifically so that path
exists: a required prop would have forced a choice between blocking the whole page on
the BFF or inventing a second set of placeholder data the shell would own instead of
the remote.

## Cross-remote state, routing, and the accessibility comparison

Stage 2 split the single composed page into real routes, `/vehicle` and `/cover`, each
owned by the shell and each mounting exactly one remote. It is built out of order,
after Stage 3: see [Roadmap](#roadmap) for why.

### Journey state goes in the URL, not in memory

Submitting the vehicle form used to just update some state the shell held. Now it
navigates:

```
/vehicle  --submit-->  /cover?registration=AB12CDE&year=2019&mileage=8000
```

`remote_account` does not need the registration for anything it does, so it is shown
as shell-owned context above the panel (`host-shell/src/CoverStep.tsx`) rather than
threaded into a remote prop that would exist only to be displayed. The point of putting it in the query string rather than component state is what that
buys, each asserted in `e2e/composed.spec.ts`:

```bash
npm run test:e2e
```

- **A deep link works without the earlier step.** `/cover?registration=AB12CDE&year=2019`
  loaded directly renders the same context a user would see after submitting
  `/vehicle` themselves.
- **A refresh does not lose it.** Reloading `/cover?...` keeps the banner, because
  nothing about it lives only in a React component that a reload would remount from
  scratch.
- **Visiting `/cover` with nothing crosses the boundary degrades, it does not crash.**
  No `registration` param shows a link back to `/vehicle` instead of a blank or broken
  context line, and the account panel still renders underneath it regardless.

That suite runs against the real composed page, through module federation, not
against the remotes' own source the way `host-shell/src/composition.test.tsx` does. It
is also why Stage 1's
`measure:outage`, `measure:bff` and `measure:runtime` scripts needed updating this
stage: each assumed the old single page that mounted both remotes at once, and each
would have silently reported the wrong thing against two separate routes instead of
failing loudly. They now visit `/vehicle` and `/cover` as two steps, the way a real
journey does.

### axe, isolated versus composed

```bash
npm run measure:axe
```

Builds for production and runs axe against each remote standalone (its own page, no
shell chrome, `:3001` and `:3002`) and against the shell with that remote mounted on
its real route (`:3000/vehicle`, `:3000/cover`).

| Target | Violations |
|---|---|
| remote-quote, standalone | 0 |
| remote-quote, composed (shell /vehicle) | 0 |
| remote-account, standalone | 0 |
| remote-account, composed (shell /cover) | 0 |

**The finding is that there is no finding, and that is worth taking seriously rather
than at face value.** `CLAUDE.md`'s own Stage 2 notes predicted composing would
introduce violations the isolated remotes do not have: duplicate landmarks, heading
order across a boundary, focus order between modules. Measured, it did not happen, on
either route. Two things explain it, and neither was an accident this stage gets to
take credit for:

1. **The accessibility work was structural, not incidental, from Stage 0 onward.**
   `shared-ui`'s `Input` uses `useId` so two instances cannot collide, `Panel` takes a
   `headingLevel` the shell supplies so a remote cannot assume it owns `<h2>`, and the
   hint-in-a-label bug is fixed once in the package rather than per remote. Composing
   had less room to go wrong because the primitives that could go wrong were already
   shared.
2. **Stage 2 itself removed the one DOM both remotes could collide in.** With each
   remote on its own route, `remote_quote` and `remote_account` are never mounted
   together any more, so the specific failure mode duplicate-ID and duplicate-landmark
   checks exist to catch (two things claiming the same identity in one document) has no
   page left to occur on. `host-shell/src/composition.test.tsx` still guards it at the
   unit level, because a future page that does mount two remotes together (a review
   step, say) would reintroduce exactly that risk, and the guard should already be
   there when it does.

`e2e/axe.spec.ts` turns this into a CI gate: the same four checks, asserted at zero
violations rather than reported. If a future change makes one of them fail, that is the
real finding this stage was looking for, and the right response is to report it in this
README, not loosen the assertion to make the suite pass again.

## What fetching per route costs and buys

Stage 4 made `VehicleStep.tsx` and `CoverStep.tsx` each `React.lazy`-imported from
`App.tsx` (the fifth composition check above), and made each one fetch its own bff
resource independently, on mount, rather than the shell fetching the whole aggregated
journey up front and gating both routes on it. `host-shell/src/bff.ts` still holds
both approaches, switched by `LAZY_MODE`:

| Mode | What it does |
|---|---|
| `lazy` | the real configuration: each route calls its own `/downstream/*` endpoint |
| `eager` | Stage 2/3's shape: one `/journey` call, kicked off by whichever route asks first, that both routes wait on |

```bash
npm run measure:lazy
```

Rebuilds `host-shell` in both modes and measures, cold, with a live bff: time to
interactive for `/vehicle` visited alone, for `/cover` visited alone (a deep link,
nothing else loaded first), and the total bff requests for a full two-route journey.

| LAZY_MODE | /vehicle alone TTI | /vehicle alone bff calls | /cover alone TTI | /cover alone bff calls |
|---|---|---|---|---|
| `eager` | 218ms | 2 (session, journey) | 304ms | 2 (session, journey) |
| `lazy` | 199ms | 2 (session, vehicle) | 299ms | 2 (session, account) |

| LAZY_MODE | Full journey (both routes) bff requests |
|---|---|
| `eager` | 2 (session, journey) |
| `lazy` | 3 (session, vehicle, account) |

**The win is asymmetric, and the asymmetry is the finding.** Vehicle's own downstream
call takes 120ms; account's takes 150ms, because that is how `bff/src/downstream/`
was seeded in Stage 3. Under `eager`, visiting `/vehicle` still waits on `/journey`,
which waits on the *slower* of the two calls regardless of which one `/vehicle`
actually needs. Under `lazy`, `/vehicle` waits on exactly its own 120ms. That gap
(roughly 20-40ms across repeated runs on this machine, noisy but consistently in
`lazy`'s favour) is the real saving. `/cover` sees almost nothing, because account was
already the slower call inside the aggregated response too: aggregation never cost
`/cover` anything, it only ever cost `/vehicle`, and only because `/vehicle` happened
to be the faster of the two resources sharing one call.

**It costs one request.** A full journey makes 3 bff requests under `lazy` against 2
under `eager`, re-opening exactly the round trip Stage 3 spent a whole stage saving.
That is a genuine trade-off, not a strict win, and it is why `lazy` is still the
better default rather than an obviously better one: most of this journey's cost is a
user who visits one route and leaves, not one who completes both, and `eager` makes
that single visit slower so that a two-route visit can be one request cheaper. `bff.ts`
keeps both switches live specifically so this trade-off stays reproducible rather than
becoming an assertion nobody can re-check.

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
- **A hand-rolled static server has to implement SPA fallback by hand.** The webpack
  dev server's `historyApiFallback` makes `/cover` just work; `scripts/serve-dist.mjs`,
  used for every production-build measurement, 404s on it by default, because it maps
  a path straight to a file and `/cover` is not one. Fixed by falling back to
  `index.html` for extensionless paths, and only for `host-shell`: the other two apps
  have no client-side routes of their own, and an actual missing asset should still
  404, not silently serve the shell's page.
- **A page that always redirects to one remote is not evidence about the other.**
  Three measurement scripts (`measure-outage`, `measure-bff`, `measure-runtime`)
  checked `document.querySelector('.account-facts')` against `http://localhost:3000/`,
  which is true before Stage 2 (both remotes on one page) and false after it regardless
  of correctness (`/` now redirects to `/vehicle` alone). None of them failed loudly:
  `measure-outage`'s assertions went red because they expected a value that could no
  longer be true, which was at least visible, but `measure-runtime`'s rendered check
  would have silently reported "no" forever without ever meaning anything was broken.
  Routing is exactly the kind of change CLAUDE.md's stage list did not call out as
  needing a script update, and it needed three.
- **Predicting a finding and then measuring it are different exercises, and the
  measurement is the one that counts.** `CLAUDE.md`'s Stage 2 notes expected composing
  to introduce axe violations isolated remotes do not have. Measured, both routes
  scored zero, same as both remotes standalone. The honest move was to report that,
  with the two structural reasons it probably held (accessibility built into
  `shared-ui` rather than into each remote, and the route split meaning no page ever
  mounts two remotes at once any more), not to go looking for a violation to make the
  prediction true.
- **Aggregation's saving is asymmetric once two resources have different costs.**
  `/journey` waits on the slower of two downstream calls (account, 150ms) no matter
  which one a route actually needs. Fetching per route only helps the route asking for
  the *faster* resource; the route asking for the slower one was never held up by
  aggregation in the first place, because it was always going to wait that long. A
  single eager-vs-lazy number would have hidden that the saving belongs to one route
  and not the other.
- **One session, many independent fetchers, needs memoisation or you double the
  session calls.** `VehicleStep` and `CoverStep` each call their own fetch function
  with no knowledge of the other, which is the whole point of fetching per route. Left
  alone, that means each one calling `POST /auth/session` for itself. `bff.ts` holds
  one `sessionPromise` for the module's lifetime; whichever route asks first starts it,
  and every later caller, on either route, awaits the same one.
- **A bare DefinePlugin global cannot be imported outside webpack.** `BFF_MODE` was a
  `declare const` substituted at build time, which worked until `bff.test.ts` tried to
  import `bff.ts` directly under Vitest and hit a `ReferenceError`: the identifier
  genuinely does not exist unless webpack has run. Switched both `BFF_MODE` and the new
  `LAZY_MODE` to `process.env.X`, DefinePlugin's conventional target. Webpack still
  inlines it as a literal; Node's real `process.env` just answers `undefined` for the
  same key when nothing has inlined it, which is the behaviour a test needs and a bare
  global cannot give it.
- **`networkidle` is not a reliable signal once two fetches can race across a
  navigation.** Two measurement scripts clicked the "Cover" nav link and waited for
  `networkidle` to decide the page had settled. Under Stage 4's per-route fetching,
  `/vehicle`'s own fetch can still be resolving when that click happens, and the gap
  between it finishing and `/cover`'s starting can look like 500ms of quiet on its own,
  so `networkidle` fired before `/cover`'s panel had actually rendered. One run showed
  it directly: `measure-runtime`'s "both routes rendered" column read "no" for modes
  that worked fine, because the byte count was taken before the account chunk had
  finished loading. Fixed by waiting for the element the fetch actually produces
  (`.account-facts` or the fallback `.panel--notice`) instead of a network-quiet
  heuristic that assumed one request chain, not two independent ones.

## Roadmap

- [x] **Stage 0.** Host plus one remote, composing at runtime. Vitest unit tests
- [x] **Stage 1.** Second remote, shared component package as a federated singleton,
      duplicate-React cost measured
- [x] **Stage 2.** Cross-remote state handled deliberately. Playwright integration
      suite running axe against the *composed* page, not each remote alone. Built out
      of order, after Stage 3: Playwright was already in the repo as a
      measurement-script dependency, so this stage was mostly wiring a runner and a
      CI-ready suite around a tool already proven to work here.
- [x] **Stage 3.** NestJS BFF: aggregation, caching, holds the session token
- [x] **Stage 4.** Lazy loading and code splitting, measured against time to interactive
- [ ] **Stage 5.** Independent deploy per remote, and a deliberate version-skew failure

## Measurements

Filled in as each stage lands. Nothing is quoted here that was not measured by a
command in this file.

| What | Result | Stage | Command |
|---|---|---|---|
| Remote code present in host bundle | None | 0 | `grep -rl` above |
| Shell survives a dead remote | Yes, degraded panel, no uncaught error | 0 | `npm run measure:outage` |
| One remote down costs exactly one panel | Yes, in all four outage cases | 1 | `npm run measure:outage` |
| Total JS on disk, everything shared | 556.7 KB | 1 | `npm run measure:shared` |
| Total JS on disk, nothing shared | 538.5 KB | 1 | `npm run measure:shared` |
| Cost of sharing, on disk | +18.3 KB | 1 | `npm run measure:shared` |
| JS fetched for the whole journey, everything shared | 217.2 KB | 1 | `npm run measure:runtime` |
| What the `shared-ui` singleton saves, fetched | 5.7 KB | 1 | `npm run measure:runtime` |
| React copies fetched, everything shared | 1 | 1 | `npm run measure:runtime` |
| React copies fetched, nothing shared | 3, and the page does not work | 1 | `npm run measure:runtime` |
| React copies fetched, `singleton: false` | 1, and the page works | 1 | `npm run measure:runtime` |
| bff requests, no aggregation | 3 (session, vehicle, account) | 3 | `npm run measure:bff` |
| bff requests, aggregated | 2 (session, journey) | 3 | `npm run measure:bff` |
| Round trips saved by aggregation | 1 | 3 | `npm run measure:bff` |
| Journey cache, back-to-back loads | MISS then HIT | 3 | `npm run measure:bff` |
| Access token present in a remote's bundle | None | 3 | `grep -rl` above |
| A deep link to `/cover` renders without visiting `/vehicle` | Yes | 2 | `npm run test:e2e` |
| A refresh of `/cover` keeps its vehicle context | Yes | 2 | `npm run test:e2e` |
| axe violations, remote-quote isolated vs composed | 0 vs 0 | 2 | `npm run measure:axe` |
| axe violations, remote-account isolated vs composed | 0 vs 0 | 2 | `npm run measure:axe` |
| /vehicle alone, time to interactive, eager vs lazy | 218ms vs 199ms | 4 | `npm run measure:lazy` |
| /cover alone, time to interactive, eager vs lazy | 304ms vs 299ms | 4 | `npm run measure:lazy` |
| bff requests, full journey, eager vs lazy | 2 vs 3 | 4 | `npm run measure:lazy` |
| Shell's own route code genuinely split per route | Yes | 4 | `grep -l` above |
| Unit tests | 64 passing | 4 | `npm test` |
| Playwright e2e + axe tests | 10 passing | 2 | `npm run test:e2e` |

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
- Stage 2's routing change broke three existing measurement scripts, none of them
  loudly. `measure-outage.mjs` at least failed its own assertions once `/` stopped
  showing both panels. `measure-runtime.mjs`'s rendered check did not fail; it just
  started reporting a value that could never be true again, silently, which is worse.
  All three (`measure-outage`, `measure-bff`, `measure-runtime`) were rewritten to
  check the right route for the right remote before this stage's own numbers were
  trusted.
- The first reading of `npm run measure:axe`'s zero-violations result was suspicion,
  not acceptance: a harness that always reports zero and a harness that genuinely finds
  nothing look identical from the output alone. Verified by running the same
  `AxeBuilder` against a page deliberately built with an unlabelled button and a
  missing `alt`, which reported seven violations. The zero on the real pages is
  reported as a finding in the README because it survived that check, not because it
  was the first number the script produced.
- Stage 4's first version of `measure-lazy.mjs` asserted that `lazy` must cost fewer
  bff requests than `eager` for a single route visited alone. It failed immediately:
  both modes make exactly one data request either way, because `/journey` is one HTTP
  request regardless of how much work it does behind it. The assertion was testing the
  wrong dimension. Corrected to assert on latency for the single-route case and on
  request count only for the full-journey case, which is where that difference
  actually is.
- Stage 4 reused `measure-runtime.mjs` and `measure-bff.mjs`'s "click Cover, wait for
  network idle" pattern for `measure-lazy.mjs`'s own full-journey check, before
  realising it was the same fragile wait the Stage 4 change had just broken in the
  other two scripts. Fixed in all three at once rather than patching the one that
  happened to fail first.
- Stage 2's `measure-bff.mjs` still builds `host-shell` with `BFF_MODE` forced, and
  Stage 4 added a second switch, `LAZY_MODE`, that the split/aggregated comparison only
  means anything under `eager`. Left alone, the script's own builds would have landed
  on `LAZY_MODE=eager` last, silently leaving the working tree in a configuration
  nothing else in the repo defaults to. Fixed by having the script explicitly rebuild
  `host-shell` with no overrides as its last step, restoring the real configuration
  after its own comparison is done, the same guarantee every other measurement script
  gets for free by making the real mode the last one in its own list.

## Licence

MIT
