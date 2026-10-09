# Working on this repo

Context and conventions for anyone, human or agent, picking this up mid-build.

## What this is and why

A host shell composing independently deployed micro frontends at runtime with Webpack 5
Module Federation, React and TypeScript, with a NestJS backend-for-frontend.

It is a learning-by-building project, so **the findings matter more than the features**.
The point is not a working quote funnel. The point is understanding what this
architecture costs, what breaks, and what the numbers actually are. A stage is not done
because the code runs; it is done when something has been measured or a failure mode has
been reproduced and written up.

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
host-shell/      :3000  the shell. Owns layout, navigation, design tokens, and later the session
remote-quote/    :3001  vehicle details. Own build, own server, own tests
```

Both apps use `ts-loader` through webpack. Tests run on Vitest from the workspace root,
and are excluded from the webpack build.

## Commands

```bash
npm install
npm start               # both apps
npm run start:shell     # just the shell, if the other is already running
npm run start:quote     # just the remote
npm test                # Vitest
npm run build           # production build of both
```

## The three checks that prove composition is real

Run these after any change to the federation setup. A federated host is easy to confuse
with an app that merely code-splits.

```bash
npm run build
grep -rl "Year of manufacture" host-shell/dist/     # must find nothing
grep -rl "Year of manufacture" remote-quote/dist/   # must find something
grep -roh "localhost:3001/remoteEntry.js" host-shell/dist/
```

Then the behavioural one: `lsof -ti:3001 | xargs kill`, reload `:3000`, and confirm the
shell renders with the degraded panel instead of dying. Restart with
`npm run start:quote`.

**Note for agents:** the dev servers read `tsconfig` once at startup. After changing any
tsconfig or webpack config, restart them or you will debug a stale compile.

## Stages

Each stage is independently committable and leaves the repo in a coherent state. Update
the README roadmap and measurements table as each lands.

### Stage 0: host plus one remote, composing at runtime. DONE

Acceptance: the three checks above pass, plus a dead remote degrades to a fallback with
no uncaught error. Unit tests on the remote's form.

### Stage 1: second remote and a shared component package

- Add `remote-account` on `:3002`, exposing a policy summary surface.
- Extract a `shared-ui` package (button, input, panel) consumed by both remotes as a
  federated singleton.
- **Measure:** total bytes with the shared package as a singleton versus each remote
  bundling its own copy. Also React itself as singleton versus duplicated, including
  capturing the actual error a duplicated React produces.

Acceptance: a measurement in the README with the command that produced it, and a written
note on what the singleton actually buys.

### Stage 2: deliberate cross-remote state, and an integration stage in CI

- Routing and session in the shell. Journey state that must cross a boundary goes in the
  URL, so a deep link and a refresh both work.
- Playwright running against the **composed** page, not each remote alone.
- axe run twice: against each remote in isolation, and against the shell with every
  remote mounted. Report both numbers.

Acceptance: both axe numbers in the README. If composing produces violations that
isolated remotes do not, that is the headline finding of the stage. Expect duplicate
landmarks, duplicate IDs, heading order across boundaries, and focus order between
modules.

### Stage 3: NestJS backend-for-frontend

- `bff/` on `:4000`. Aggregates what the journey needs so the page does not make one
  round trip per remote.
- Caches the aggregated response.
- Holds the session. No remote holds a token. Refresh token in an httpOnly cookie,
  short-lived access tokens to the browser.
- Keep business rules out of it. It is a client-shaping layer, not a second backend.

Acceptance: a measurement of round trips before and after aggregation, and a note on
where the BFF boundary was drawn and why.

### Stage 4: lazy loading and code splitting

- Route-level splitting in the shell, remotes loaded on demand.
- **Measure:** time to interactive with everything eager versus lazy.

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
   unit test. Fixed with `aria-describedby` plus a guard test.
