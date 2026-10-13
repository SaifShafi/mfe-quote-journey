# Working on this repo

Context and conventions for anyone, human or agent, picking this up mid-build.

## What this is and why

A host shell composing independently deployed micro frontends at runtime with Webpack 5
Module Federation, React and TypeScript, with a NestJS backend-for-frontend.

It is a learning-by-building project. Findings matter more than features. A stage is
done when something has been measured or a failure mode has been reproduced and written
up, not when the code merely runs.

This mirrors the house style of two sibling repos: build the competing version, measure
it, and publish the unflattering numbers alongside the good ones.

## Non-negotiable conventions

- **No number in the README that was not produced by a command in the README.** If it
  cannot be reproduced, it does not go in. This applies to bundle sizes, timings,
  accessibility counts, everything.
- **Record corrections honestly** in the README's "AI workflow" and "Notes from building
  it" sections, including configuration mistakes and things that had to be undone. The
  mistakes are the most useful content in the file.
- **No em dashes in any prose.** Use commas, colons or parentheses.
- **Comments explain why, not what.** Especially in the webpack configs, where the
  non-obvious constraints live.
- **Guard tests, not just fixes.** When a bug is found, add the test that makes it
  impossible to reintroduce before fixing it.
- **Accessibility is a gate, not a review item.** Any new interactive surface needs its
  accessible name asserted in a test.
- Commits carry `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  when written with AI assistance. Supervised AI use is part of what this repo
  documents, so it is recorded rather than hidden.

## Layout

```
host-shell/      :3000  the shell. Owns layout, navigation, routing, tokens, and the session
remote-quote/    :3001  vehicle details. Own build, own server, own tests
remote-account/  :3002  policy summary. Same
bff/             :4000  NestJS. Aggregates both remotes' data, caches it, holds the session
shared-ui/              button, input, panel. Federated singleton, consumed by all three
shared-config/          the shared-module map all three webpack configs read from
scripts/                measurement harnesses. Every number in the README comes from one
e2e/                     Playwright suite against the composed page, plus the axe gate
playwright.config.ts     webServer builds and serves the production output for e2e/
```

The shell routes with `react-router-dom`: `/vehicle` mounts `remote_quote`, `/cover`
mounts `remote_account`. State that crosses that boundary (the submitted registration)
goes in the URL's query string, not component state, so a deep link to `/cover` and a
refresh of it both work. See `host-shell/src/VehicleStep.tsx` and `CoverStep.tsx`.

Both step components are `React.lazy`-imported from `App.tsx` (Stage 4), so each
route's own code, including the `loadRemote()` call for its remote, is a separate
chunk. Each also fetches its own bff resource independently, on mount
(`fetchVehicle()` / `fetchPolicy()` in `host-shell/src/bff.ts`), rather than the shell
fetching the whole journey up front: `/vehicle` never waits on account data it does not
need. One session is still shared between them (`bff.ts`'s own memoised
`sessionPromise`), so this costs no extra `POST /auth/session` calls.

The three frontend apps use `ts-loader` through webpack. `bff` runs off its TypeScript
source directly via `ts-node`, no build step in dev; `npm run build` in `bff/` exists
for a later deploy stage but nothing here depends on it yet. Tests run on Vitest from
the workspace root, and are excluded from the webpack build. That includes `bff`'s:
Vitest transforms TypeScript with esbuild, which does not implement
`emitDecoratorMetadata`, so every constructor Nest resolves by DI needs an explicit
`@Inject(Service)` token rather than relying on the type alone. Without it the
dependency is silently `undefined`, with no error at compile time or at bootstrap.

`shared-ui` ships TypeScript source with no build step of its own, reached through the
npm workspace symlink. Webpack resolves that to a real path outside `node_modules`, so
`ts-loader` compiles it despite the `exclude`. Each app's tsconfig has to `include`
`../shared-ui/src` for this to type-check.

## Commands

```bash
npm install
npm start               # all four apps
npm run start:shell     # just the shell, if the others are already running
npm run start:quote
npm run start:account
npm run start:bff
npm test                # Vitest, including bff's
npm run build           # production build of the three frontend apps

npm run measure:outage  # asserts: one remote down costs exactly one route
npm run measure:shared  # bytes on disk per sharing mode
npm run measure:runtime # bytes fetched for the whole journey, React copies, per mode
npm run measure:bff     # bff round trips, before and after aggregation; cache proof
npm run measure:axe     # axe, isolated vs composed, for each remote's route
npm run measure:lazy    # time to interactive per route, eager vs lazy bff fetching
npm run test:e2e        # Playwright suite against the composed page, incl. axe gate
npm run serve:dist      # serve the production builds on the real ports
```

The measurement scripts drive headless Chromium through Playwright, pinned to 1.52
because later versions need Node 20 and this machine has Node 18. `MFE_SHARED`
switches the shared-module map (`all`, `no-ui`, `dup-react`, `none`); `BFF_MODE`
switches whether `host-shell` calls the bff's aggregator or its two downstream
endpoints directly (`aggregated`, `split`), and only matters when `LAZY_MODE=eager`;
`LAZY_MODE` switches whether the host fetches per route, on demand (`lazy`, the real
configuration) or fetches the whole journey up front and gates both routes on it
(`eager`, Stage 2/3's shape). Everything except `all`/`aggregated`/`lazy` is a
deliberately broken build. Every script except `measure:bff` leaves the real
configuration built last by construction (it is just the last mode in its own list);
`measure:bff` forces `LAZY_MODE=eager` throughout its own comparison and explicitly
rebuilds with no overrides as its last step to put the real configuration back.
`measure:bff`, `measure:axe` and `measure:lazy` also start and stop a real `bff`
process via `ts-node`, not `tsx`: `tsx`'s own config-loading code calls
`Array.prototype.toReversed`, an ES2023 method this machine's Node 18 does not have.

Both `BFF_MODE` and `LAZY_MODE` are read in `bff.ts` via `process.env.X`, not a bare
DefinePlugin global: a bare `declare const` throws a `ReferenceError` the moment
something imports `bff.ts` without webpack (`host-shell/src/bff.test.ts` does exactly
that). `process.env.X` is DefinePlugin's conventional target, webpack still inlines it
as a literal, and Node's real `process.env` just answers `undefined` for the same key
under Vitest.

`npm run test:e2e` is the separate runner Stage 2 added (`@playwright/test`, also
pinned at 1.52.0 to match). Its config's `webServer` runs
`npm run build && node scripts/serve-all.mjs`, which boots the same static servers and
`bff` the measurement scripts use, so the suite exercises the same artifact the numbers
in the README come from. `scripts/serve-dist.mjs` implements SPA fallback for
`host-shell` only (`/cover` is a client route, not a file); the other two apps have no
client-side routes and still 404 on anything that is not a real asset.

## The three checks that prove composition is real

Run these after any change to the federation setup. They show the remote is loaded over
the network, not bundled into the shell.

```bash
npm run build
grep -rl "Year of manufacture" host-shell/dist/       # must find nothing
grep -rl "Your current policy" host-shell/dist/       # must find nothing
grep -rl "Year of manufacture" remote-quote/dist/     # must find something
grep -rl "Your current policy" remote-account/dist/   # must find something
grep -roh "localhost:300[12]/remoteEntry.js" host-shell/dist/ | sort -u
grep -rl "accessToken" remote-quote/dist/ remote-account/dist/   # must find nothing
```

Then the behavioural one, now automated and asserting: `npm run measure:outage`. Each
remote has its own route since Stage 2 (`/vehicle`, `/cover`), so it visits both and
exits non-zero if either route loses the shell, raises an uncaught error, or degrades a
route whose remote is up. By hand the Stage 0 version still works: `lsof -ti:3001 |
xargs kill`, reload `:3000`, restart with `npm run start:quote`. Killing `bff`
(`lsof -ti:4000 | xargs kill`) and reloading is the Stage 3 version: both routes still
render, from each remote's own defaults.

**Note for agents:** the dev servers read `tsconfig` once at startup. After changing any
tsconfig or webpack config, restart them or you will debug a stale compile.

## Stages

Each stage is independently committable and leaves the repo in a coherent state. Update
the README roadmap and measurements table as each lands.

### Stage 0: host plus one remote, composing at runtime. DONE

Acceptance: the three checks above pass, plus a dead remote degrades to a fallback with
no uncaught error. Unit tests on the remote's form.

### Stage 1: second remote and a shared component package. DONE

`remote-account` on `:3002` exposing `./PolicySummary`; `shared-ui` extracted and
consumed by all three as a federated singleton; both byte measurements and the
duplicate-React error in the README, each with its command.

Headline: sharing costs 21.4 KB on disk and saves 2.4 KB over the wire for the whole
journey. The singleton is not a byte optimisation at this size. What it buys is one
React and one module registry, and the cost of not having that is a broken page, not a
slow one.

### Stage 2: deliberate cross-remote state, and an integration stage in CI. DONE

The shell routes with `react-router-dom`: `/vehicle` and `/cover`, one remote each.
Submitting the vehicle step carries its registration forward in the URL's query
string, not component state, so `/cover?registration=...` deep-links and survives a
refresh. `e2e/composed.spec.ts` asserts the whole flow against the composed page
through module federation, via the `@playwright/test` runner Stage 1 anticipated
(`playwright.config.ts`, `scripts/serve-all.mjs`).

`npm run measure:axe` runs axe against each remote standalone and against the shell
with that remote mounted on its real route. Both numbers are zero, on every route.
`e2e/axe.spec.ts` turns that into a CI gate at zero rather than a number to watch.

Acceptance met, but the finding differs from what this section predicted: composing
did **not** introduce violations the isolated remotes lack. Write-up and the two
reasons (accessibility built structurally into `shared-ui` since Stage 0/1; each route
now mounting exactly one remote, so the duplicate-ID/landmark collision this stage
expected to find has no page left to happen on) are in the README. Duplicate IDs are
still guarded in `host-shell/src/composition.test.tsx` for the day a page mounts two
remotes together again.

### Stage 3: NestJS backend-for-frontend. DONE

`bff/` on `:4000` aggregates vehicle and policy data behind `GET /journey`, caches the
aggregated response by session subject, and holds the session: a short-lived JWT
access token to the browser, a long-lived httpOnly refresh token scoped to
`/auth/refresh`, rotated on every use. No remote holds either; the shell is the bff's
only caller and hands remotes resolved data as props. Round-trip measurement, cache
proof and the boundary note are all in the README, each with its command.

Headline: aggregation saves one round trip per page load today (3 to 2), and the
saving is per remote, not fixed, since `split` mode adds one request per remote while
`aggregated` adds none. A bff outage degrades to each remote's own standalone
defaults rather than losing the page, the same shape as a dead remote in Stage 0.

### Stage 4: lazy loading and code splitting. DONE

`VehicleStep.tsx`/`CoverStep.tsx` are `React.lazy`-imported from `App.tsx`, so each
route's own code (including its `loadRemote()` call) is a separate chunk. Each fetches
its own bff resource on mount (`fetchVehicle()`/`fetchPolicy()`), instead of the shell
fetching the whole journey up front and gating both routes on it, with one session
still shared between them. `LAZY_MODE` (`lazy`/`eager`) switches between the two for
`npm run measure:lazy`, which left `BFF_MODE`'s own comparison (Stage 3) intact by
forcing `LAZY_MODE=eager` for that one script.

Headline: the saving is asymmetric. `/vehicle` is faster under `lazy` (not held up by
account's slower downstream call any more); `/cover` is not, because account was
already the slower half of the aggregated call either way. A full journey costs one
more bff request under `lazy` (3 vs 2), which is Stage 3's own saving partially
reopened, in exchange for not blocking the first route on data it may never need.

### Stage 5: optional, in value order

1. Independent deploy per remote in GitHub Actions, with a version-pinned remote URL so
   a single remote can be rolled back. Then a deliberate version-skew failure: ship a
   breaking change to `shared-ui` and document what the host does.
2. OIDC authorization code flow through the BFF.
3. Deploy to GCP.
4. A small Terraform config for that deploy.

## Findings so far

Full writeups are in the README. Short form, because these are the reason the repo
exists:

1. **A dead remote fails in a phase React cannot see.** It throws
   `ScriptExternalLoadError` inside webpack's shared-scope negotiation, because before
   the host resolves its own shared React it initialises the remote containers to
   negotiate versions. That is a promise rejection during module loading, not an error
   during render, so an error boundary alone does not cover it. Handled at the dynamic
   `import()`, with the boundary kept for post-load failures.
2. **Design tokens are an unchecked cross-boundary contract.** The shell owns
   `tokens.css`; the remote's stylesheet has no hard-coded values. Rename a token and the
   remote does not fail to build, it silently renders the initial value. Symmetrical with
   `host-shell/src/remotes.d.ts`, the hand-written declaration of the remote's contract
   that nothing verifies against the remote either.
3. **A visible hint inside a `<label>` joins the input's accessible name.** Caught by a
   unit test. Fixed with `aria-describedby` plus a guard test, and the fix now lives in
   `shared-ui`'s `Input`, so no remote can reintroduce it.
4. **A federated singleton makes the build bigger, not smaller.** Every participant
   still emits a fallback copy of every shared module, so `all` costs 21.4 KB more on
   disk than `none`. The deduplication happens when the browser chooses which copy to
   fetch, worth 2.4 KB here, for the whole two-step journey. A bundle-size budget in CI
   would read this backwards.
5. **Removing React from the shared map breaks the page, and the error never says
   React.** `TypeError: Cannot read properties of null (reading 'useState')`, thrown in
   the remote's bundle and called from React DOM in the host's. The null is
   `ReactCurrentDispatcher.current` on the remote's own React core, which the host's
   React DOM never set.
6. **`singleton: false` does not produce a duplicate when versions match.** Webpack's
   shared scope is keyed by version, so three apps asking for `^18.3.1` collapse to one
   copy regardless. This corrected a Stage 0 claim. The flag matters under version
   skew, which is Stage 5.
7. **Webpack breaks a shared-scope tie on the providing application's name.** React is
   served from `remote-quote` in every working mode, because `remote-quote` sorts after
   `host-shell`. The host's framework arrives from a remote, and nothing in the host's
   config says so.
8. **Aggregation's saving is per remote, not fixed.** Splitting costs one request per
   remote plus one for the session; aggregating costs one request for the session and
   one for `/journey` regardless of how many remotes feed it. Today that is 3 requests
   against 2. A third remote would make it 4 against 2.
9. **A BFF outage is an enhancement failing, not a dependency failing, and only because
   it was built that way.** `initialVehicle`/`initialPolicy` are optional, and the shell
   mounts each remote with none at all if its own fetch to the bff fails, so the remote
   falls back to the same default it uses standing alone. A required prop would have
   made the bff load-bearing by construction.
10. **Nest's DI needs `emitDecoratorMetadata`, and Vitest's esbuild transform does not
    produce it.** Every injected dependency silently resolved to `undefined`, with no
    error at compile time or at bootstrap, only the first time a handler touched it.
    Explicit `@Inject(Service)` tokens fix it and do not depend on that compiler output,
    so they behave the same under Vitest and under `ts-node`.
11. **Routing removed the one page that could have shown a cross-remote violation.**
    Stage 2 expected composing to produce axe violations isolated remotes do not have.
    Measured, every route scored zero, matching both remotes standalone. Splitting the
    journey into one remote per route means the two remotes are never in one DOM any
    more, which is the specific condition duplicate-ID and duplicate-landmark checks
    exist to catch. The prediction was reasonable; the measurement is still what
    counts, and it said something different.
12. **A measurement script can go stale exactly when the thing it measures changes
    shape, and not announce it.** Three scripts assumed the shell's single composed
    page from Stages 1 and 3. Stage 2 replaced that page with two routes, and two of
    the three scripts kept running without erroring, just reporting a value that could
    no longer be true. The fix was per script; the lesson is that a script's own
    assumptions about the page need to be checked whenever the page's shape changes,
    not just whenever the script itself changes.
13. **Aggregating two calls into one only helps the resource that was already fast.**
    `/journey` always costs max(vehicle, account), not either one alone. Fetching per
    route instead only speeds up the route asking for the faster resource; the route
    asking for the slower one was never held up by aggregation, because it was always
    going to wait that long regardless. A single "lazy is faster" headline would have
    hidden that the win belongs to one route and not the other.
14. **Lazy per-route fetching reopens the exact round trip aggregation spent a stage
    saving.** A full journey costs 3 bff requests under `lazy`, 2 under `eager`. Neither
    number is simply better: `eager` is cheaper per request but slower for whichever
    route loads first; `lazy` is faster per route but assumes the user visits both.
    `lazy` is still the better default because most of a funnel's traffic is one step
    visited, not a completed journey, but it is a trade, not a strict improvement.
15. **A bare DefinePlugin global cannot survive being imported outside webpack.**
    `BFF_MODE` as a `declare const` worked until the first test (`bff.test.ts`) tried to
    import `bff.ts` directly, and threw `ReferenceError: BFF_MODE is not defined`. The
    conventional `process.env.X` target works under both: webpack inlines it as a
    literal, Node's real `process.env` answers `undefined` for the same key otherwise.
16. **`networkidle` assumes one request chain, and breaks once there are two
    independent ones.** Clicking into a route whose own fetch can still be racing the
    previous route's gave `networkidle` a false "quiet" window between the two, before
    the second route's data had arrived. It had no symptom until a byte-measurement
    script's "both routes rendered" column read "no" for configurations that actually
    worked. Waiting for the element the fetch produces, not a network-quiet heuristic,
    is the fix, and it is a fix the whole repo needed, not just the new script.
