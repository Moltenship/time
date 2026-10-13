# Quality gates

Issue #15 makes the repository's compatibility checks executable before calendar feature code lands. CI and local development run the same named Vite+ tasks.

CI runs on Node.js 26, the server-runtime floor where the suite exercises native `Temporal` without
a V8 feature flag or bundled polyfill.

## Tiers

Three tasks group the gates below. Quick runs after every change and PR before every merge. Full
runs for releases: in the release workflow, and by hand right before a release candidate or a
release, plus once in a PR that changes the full gate or the release tooling (`AGENTS.md`).

| Tier  | Task                 | Steps                                                                                        |
| ----- | -------------------- | -------------------------------------------------------------------------------------------- |
| Quick | `vp run ready:quick` | `showcase:links`, `vp check`, `vp test`                                                      |
| PR    | `vp run ready`       | `ready:checks` (`registry:smoke` beside the `gate:serial` lane) and `a11y`                   |
| Full  | `vp run ready:full`  | Every PR step, plus `browsers` and `a11y:ci-speed`. The three browser runs go one at a time in `gate:browsers`, beside `registry:smoke` and `gate:serial:full`, which adds `release:dry-run`, `showcase:types`, search and `release:artifacts` to the serial lane |

On a 15-core Apple-silicon laptop, quick takes about 13 seconds, PR 37 seconds from a cold cache
and 24 warm, and full about 120 seconds cold (119.4 with #203's release artifacts), the release dry
run included. Beside six threads of CPU load, full took 101 to 127 seconds before #203 (#47).
The warm floor is the steps that pack packages, build the docs site or install the registry into
clean apps, which never replay: they rewrite their own inputs, or reach the network.

`gate:serial` runs `showcase:links`, `ci:check`, `ci:build`, `release:check`, `ci:test`,
`react:gate`, `ssr:smoke` and `package:graph` in that order, because each writes or reads generated
files: packages' `dist`, packed tarballs, the docs site's `.next` and `.source`. Steps outside it
read only source, so they run at the same time. The full gate runs its three browser runs one
after another in a lane of their own, `gate:browsers`, beside the serial lane: see [Load](#load).
Each browser mode keeps its own Vite dependency cache. CI's `quality-gates` job runs
`vp run ready:checks` and its `accessibility` job runs `vp run a11y`: together, `vp run ready`, on
every PR. On demand (`gh workflow run ci.yml --ref <branch>`), two more jobs run: `browsers` runs
`vp run browsers` on Linux, and `release-gate` runs what the release workflow's gate runs. When a
job fails, its last step names the failed task. The contract test `tests/quality-gates.test.ts`
holds the workflows to those task names and fails if `ready:full` misses a step of `ready`.

The release workflow runs `vp run release:gate` before it publishes: the whole full tier, with a
strict dry run of the version it publishes (`--require-clean`, `RELEASE_VERSION`) in its own lane,
`gate:serial:release`. `RELEASE_VERSION=<version> vp run release:gate` reproduces it locally, and
CI's on-demand `release-gate` job runs the same steps on a fresh runner without publishing. A check
that joins only the full gate joins `release:gate` too: its lane for a serial step, or its
`dependsOn` for a parallel one. The contract test fails if the two differ in anything but their
lanes. See [releasing.md](./releasing.md).

## CI and local runs

A step that passes locally should pass in CI. What differs between the two, and how the gate
covers it:

- **Speed.** GitHub's runner ran the a11y suite 5 to 7 times slower than an Apple-silicon laptop,
  and that is what made its flakes: focus, scroll and save races that a fast machine always wins.
  `vp run a11y:ci-speed` runs the suite with Chromium's CPU throttled 6 times
  (`Emulation.setCPUThrottlingRate`, set in `tools/a11y/tests/setup.ts` for `--mode ci-speed`), and
  the full gate runs it, never from cache. It runs beside the serial lane, which loads the machine
  further: stricter, and a little less repeatable, so rerun it alone before calling a failure a
  flake. On a GitHub runner, which is the speed it simulates, it runs unthrottled: the release
  workflow's full tier runs the suite there twice, once as `a11y` and once as `a11y:ci-speed`
  beside the serial lane.
- **Fonts.** CI's Ubuntu image has other system fonts, so text wraps and positions differ. Tests
  compare layouts with each other and with ratios, not with fixed pixels, and a test that hovers
  does so on purpose instead of trusting where the mouse was left.
- **Browser and viewport.** Both run Playwright's headless Chromium shell at 1280 × 800, from
  `tools/a11y/vite.config.ts`.
- **Node.** CI runs the latest Node.js 26; `engines` asks for 26 or later locally.
- **Generated types.** `ci:check` runs before the docs site is built. In CI it type-checks the docs
  app without the types Next.js generates (`next-env.d.ts`, `.next/types`); a laptop has whatever
  its last Next.js run left. So the docs app's own code mustn't rely on them, such as the global
  `PageProps<…>`.
- **Environment.** Vite Task runs cached steps with a small set of environment variables. Steps
  with `cache: false`, such as `registry:e2e` and the uncached release tasks, get the whole
  environment, so `REGISTRY_E2E_*` switches and proxy settings reach them through `vp run`.
- **Time zone and locale.** CI runs in UTC; laptops run in their own zone. Tests pass explicit
  `timeZone`, `locale` and `now`, so passing in both is also a check that nothing reads the host's.

## Load

A gate that fails when the machine is busy is a flaky gate, so the full gate holds its load down
and fails fast when a browser run stalls:

- **Half the cores per browser run.** By default Vitest gives each browser up to 12 pages, one
  per core but one. Three browser runs at once, beside the build and the unit tests, put up to 38
  pages on 15 cores: input and frames came late, tests ran out of time, and some runs stalled for
  20 minutes and more. Now `tools/a11y/vite.config.ts` gives a run half the cores, split between
  its browsers (Firefox and WebKit get a quarter each), and the full gate's `gate:browsers` lane
  runs `a11y`, `browsers` and `a11y:ci-speed` one at a time, beside the serial lane. The lane stops
  at the first run that fails. Reduced motion runs its one file in a page of its own, beside the
  Chromium pages of `a11y`.
  In CI's 4-core runner the `accessibility` job gets 2 pages and the `browsers` job 1 per browser.
- **Half the cores for the unit tests.** `vp test` from the root (`ci:test`, the quick tier, the
  engine tasks) takes half the cores too, in the root `vite.config.ts`, since in the PR and full
  tiers it runs beside a browser run. Its timeout is 15 seconds, as in the browser suite: a few
  tests do real work, such as a registry build, that takes under a second alone and passed 5
  seconds on a busy machine. They wait on no clock.
- **A watchdog.** A page whose main thread is stuck can't time its own tests out, so a run could
  wait for hours. `tools/a11y/watchdog.ts` is a Vitest reporter that watches from a Node worker
  thread of its own. When no test finishes for two minutes, or a run passes ten, it names the
  files and tests still running and cancels the run; if that doesn't stop it within 20 seconds, it
  kills the run and the processes under it, the browsers included. Either way the step fails. It
  doesn't watch in watch mode, a headed browser or under a debugger, and `--reporter` on the
  command line replaces it. `tools/a11y/watchdog.test.ts` tests it.
- **Waits on conditions.** A browser test waits for what it checks, with the helpers in
  `tools/a11y/tests/render.tsx`: `until` tries a check once a frame, `removed` waits for an element
  to leave the page, as a popup does after its exit animation, and `atRest` for a scroll to end and
  stay still for a few frames. None sets a deadline of its own: the test's timeout bounds them, and
  the watchdog a stuck page. When a test times out, each wait pending at that moment says what it
  was waiting for, then stops. `setup.ts` drops React's "not wrapped in act" warning: real input
  from Playwright lands outside `act()` by design, and thousands of the warnings a file, each sent
  to Node, cost a popover test more time than the popover did. The browser tests don't sleep for
  a fixed time, or give a step a one-second deadline, which a slow machine misses. A unit test that
  compares durations measures CPU time (`process.threadCpuUsage()`), which a busy machine
  stretches far less than wall time.

To check the gate under load, run it beside a CPU load, such as a few threads spinning in a loop.
Rerun a failing file alone before calling it a flake: `vp run a11y#test tests/<file>`, or
`cd tools/a11y && vp test --mode ci-speed tests/<file>` (or `--mode browsers`).

## Browsers

`vp run browsers` runs the a11y suite and `tools/a11y/tests/interactions.a11y.tsx` (real mouse and
keyboard moves and resizes) in Firefox and WebKit (`--mode browsers`); `vp run a11y` runs both in
Chromium. Chromium, Firefox and Playwright's WebKit all have Temporal, but Safari versions without it
are still in use, so WebKit runs on `temporal-polyfill`: `tools/a11y/tests/setup.ts` removes the native Temporal and
installs the polyfill before any test imports, as an app would, and a test checks it did.

- Reduced motion stays in its own Chromium context.
- Base UI's focus guards are unnamed buttons in WebKit, on purpose, for VoiceOver; `axe.ts` exempts
  them as it already does for `aria-hidden-focus`.
- Some tests skip in WebKit: focus kept in view in the scrolling agenda (#185, a 1.0 blocker), and
  until #181 the agenda's end, the 10,000-event agenda scroll (too slow on the polyfill in CI), a
  day swipe's and a month step's snap points, and a drag against the edge.
- Playwright's Firefox doesn't start on macOS 27 (#182). There the run leaves it out and says so;
  CI's `browsers` job runs it on Linux, on demand, where its timing tests still vary from run to
  run (#192).

## Passing gates

From the workspace root:

```sh
vp install
vp run showcase:links
vp run ci:check
vp run ci:build
vp run release:check
vp run ci:test
vp run react:gate
vp run ssr:smoke
vp run registry:smoke
vp run package:graph
vp run a11y
```

`vp run ready` runs the same gates, in parallel where they don't share generated files. The SSR report includes its deterministic environment, server-markup hash, recoverable hydration errors, interaction result, and unmount result. The registry report validates any `registry-item.json` files under `registry/` plus a committed contract fixture so an empty source registry cannot make the schema smoke vacuous, then builds the registry and checks the output (see [Registry](#registry)).

Every published entry point has a size budget for its emitted ESM, raw and gzip. The budgets live in
one file, [`tools/release/src/config.ts`](../../tools/release/src/config.ts), and
`vp run release:size` checks them after a build. [releasing.md](./releasing.md) describes it and
the other release checks: API reports, export checks, a clean-consumer install and the dry run.

`vp run engine:gate` is the reproducible phase-1 audit. It runs the
repository check, the interval/DST/index/revision/cache/invalid-data matrices, dependency and packed
API checks, both production engine builds and their size budgets, and the uncached protocol-v2 core
benchmark. The benchmark is a reference-hardware gate rather than a portable CI timing claim, so it
remains an explicit local task while its deterministic correctness and build checks also run in CI.

`vp run react:store` is the focused issue #25 gate. It checks and builds `calendar-react`, runs the
controlled/uncontrolled state matrix, two-root isolation, selector invalidation, injected-store and
cleanup checks, and verifies deterministic SSR/hydration. The production build check
(`packages/calendar-react/scripts/verify-public-api.mjs`) fails if the React client boundary is
dropped, and `vp run release#size calendar-react` if the runtime outgrows its budget.

`vp run react:factory` is the focused issue #26 gate. It adds the typed factory, compound controls,
custom-view registry, diagnostics/capabilities, facade consumer, direct React 19 refs, deterministic
IDs, and public declaration checks. The facade test imports only supported package roots and fails
if its third-party view needs a cast or a private source path. The React package build also checks
that the bundle keeps its `"use client"` directive.

`vp run react:gate` is the phase-2 regression gate from issue #27. It runs the repository check, the
complete React/facade package tests and production builds, the focused render/hydrate harness, the
consumer-equivalent SSR smoke, and dependency-boundary checks. The focused harness covers the
six-slice controlled-state matrix under Strict Mode, a Suspense-held transition interrupted by an
urgent update and rebased on release, selector evaluation versus React commit counts, a typed
custom view, two physical roots, and final unmount. A static known-bad import and a temporary
consumer of the actual packed React artifact both prove that React source deep imports fail.

## Intentional failure proofs

These commands must exit non-zero:

```sh
vp run ssr-fixture#fixture:bad-hydration
vp run ssr-fixture#fixture:bad-browser-global
vp run registry#fixture:known-bad
```

The hydration fixture renders different server/client locale text and reports React's hydration mismatch. The browser-global fixture reads `window` at module scope and fails during a server import. The registry fixture is valid enough for shadcn's base schema to reach the repository checks, then fails its npm dependency, drag-and-drop, registry dependency, source/target, CSS variable, stylesheet, and generated-compatibility contracts.

## Release artifacts

`vp run release:artifacts` runs what uses the release artifacts on the tarballs the dry run packed.
The full tier and the release gate run it after `release:dry-run`, at the end of the same lane. It
reads `.release/manifest.json`, which must come from a dry run of `HEAD`, and checks every tarball's
and registry file's sha512 against it before and after. Nothing packs again.

| Consumer | What it runs | Network |
| --- | --- | --- |
| `ssr-fixture` | The fixture's tests: render, hydrate, interact and unmount, and the known-bad cases fail | None, unless pnpm's cache lacks metadata (below) |
| `showcase` | `next build` of the docs site; every route through `next start` (`scripts/verify-production.mjs`), with the dry run's registry at `/r`; then the docs tests, which render the live examples | The build fetches the site's Google fonts, as `ci:build` does; metadata as for the fixture |
| `registry` | `vp run registry:e2e` on the dry run's tarballs: `shadcn add` into clean Vite and Next.js apps, then a typecheck and a build of each | npm and shadcn's own components |

The SSR fixture and the docs site run in a copy outside the workspace: `apps/ssr-fixture`, or
`apps/showcase` with `registry/`, at the same paths, with the files git tracks or would track. The
copy is a pnpm workspace of its own, with the workspace's catalog, overrides and lockfile, and
overrides that send every `@moltenship` dependency, direct or not, to its tarball. Its
`tsconfig.base.json` has no `paths` into package source, and it has no package source at all. Its
commands find the copy's binaries, never the workspace's. The workspace keeps its links, so dev
setup doesn't change.

The copy installs with `--offline`, from the pnpm store and metadata cache that `vp install`
filled. A fresh machine's cache may lack metadata that resolving the copy needs, since
`vp install --frozen-lockfile` skips resolution; then the install reads that metadata from npm, says
so, and still takes every package from the store. Either way, the copy's lockfile must list each
`@moltenship` package with its tarball's hash, and every other package with the version and hash
the workspace's lockfile has. The registry's install test checks its apps' lockfiles against the
tarballs it served, and reports their hashes, which must be the dry run's.

The docs site builds in full: from scratch, the build takes about 10 seconds on a laptop, and it
compiles, type-checks and prerenders every page, live examples included. A smaller proof would
leave pages out. Two docs tests, `anatomy-source` and `recurrence-api-reference`, compare the docs
with package source, which the copy doesn't have, so this run leaves them out; `ci:test` runs them.

The consumers run side by side, one per four cores: all three with 12 cores or more, one after
another on a 4-core CI runner. None opens a browser, so the browser runs keep their lanes. A failure
doesn't stop the others. The summary gives each consumer's time and its steps', and a failure names
the consumer and the step, shows the end of the command's output and keeps the copy. The registry's
failures also name each app and its step, such as `vite at "typecheck"`. A docs build that failed:

```text
✓ ssr-fixture   4.0s  install 0.8s · render and hydrate 2.7s
✗ showcase     15.5s  install 2.6s · build failed after 12.9s

showcase failed at "build": next build exited with 1 in /var/folders/…/moltenship-showcase-7EQG2D/apps/showcase
```

`vp run release:artifacts showcase` runs one consumer, and `--keep` keeps the copies.

On the 15-core laptop, quiet, `release:artifacts` takes about 22 seconds: the registry's install
test, which the full tier ran on its own before (about 20 seconds, packing its own tarballs), is
the longest, and the other two finish beside it. Its cost to the full tier is a second or two. One
after another, as on a 4-core runner, the three take their sum: about 45 seconds on the laptop.

## Registry

`vp run registry:smoke` runs in `ready`. It validates every `registry-item.json` under `registry/`
and a committed contract fixture, so an empty source registry can't make it vacuous, then builds the
registry with `shadcn build` into a temporary folder, offline, and checks the output: every import
resolves to a file, component or package the item's install provides, `calendar-full` installs
every other item and owns no files, no two items write the same file, nothing depends on a
drag-and-drop library, and each range holds for the workspace versions. `vp run registry#fixture:known-bad`
must fail.

`vp run registry:e2e` is the install test. It needs the network for npm and shadcn's own
components, takes 15 to 35 seconds once the pnpm store is warm, and isn't part of `ready`. It
makes clean Vite and Next.js apps with `shadcn init`, runs `shadcn add <url>/calendar-full.json`
against the registry served from a local server, checks the files, aliases, package.json and
installed runtime, then typechecks and builds both apps. The runtime packages are packed from the
workspace and served from a local npm registry for the `@moltenship` scope, and each app's lockfile
must have them with the served tarballs' hashes. The full tier runs it through
`release:artifacts`, with the dry run's tarballs instead of packing again. `REGISTRY_E2E_PACKAGES=npm`
switches the test to the published packages; `registry/README.md` lists its other switches.

### Registry compatibility metadata

The build writes each item's runtime range into shadcn's extensible `meta` field, from the version
the workspace builds and tests with:

```json
{
  "dependencies": ["@moltenship/calendar@^1.0.0"],
  "meta": {
    "compatibility": {
      "@moltenship/calendar": "^1.0.0"
    }
  }
}
```

The range covers the item's whole install, its registry dependencies included, and `shadcn add`
installs a matching runtime. `compatibility.json`, written next to the built items, lists every
item with its URL, range, packages, items and targets, and the workspace versions; release tooling
reads it. `findIncompatibleItems` from `tools/registry` reports the items an installed runtime falls
outside of, and the install test fails on any.

Source manifests list bare package names and leave `meta.compatibility` to the build. Targets start
with one of shadcn's alias placeholders (`@components/`, `@ui/`, `@lib/`, `@hooks/`) or `~/`, and
CSS variable names use standard shadcn tokens or the `calendar-*` namespace.
