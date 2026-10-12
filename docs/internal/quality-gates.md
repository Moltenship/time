# Quality gates

Issue #15 makes the repository's compatibility checks executable before calendar feature code lands. CI and local development run the same named Vite+ tasks.

CI runs on Node.js 26, the server-runtime floor where the suite exercises native `Temporal` without
a V8 feature flag or bundled polyfill.

## Tiers

Three tasks group the gates below. `AGENTS.md` says which one a change runs.

| Tier  | Task                 | Steps                                                                                        |
| ----- | -------------------- | -------------------------------------------------------------------------------------------- |
| Quick | `vp run ready:quick` | `showcase:links`, `vp check`, `vp test`                                                      |
| PR    | `vp run ready`       | `ready:checks` (`registry:smoke` beside the `gate:serial` lane) and `a11y`                   |
| Full  | `vp run ready:full`  | Every PR step, `a11y:ci-speed`, `browsers`, then `showcase:types`, search and `registry:e2e` in `gate:serial:full` |

On a 15-core Apple-silicon laptop, quick takes about 13 seconds, PR 37 seconds from a cold cache
and 24 warm, and full 112 seconds cold and 103 warm. The warm floor is the steps that pack packages,
build the docs site or install the registry into clean apps, which never replay: they rewrite their
own inputs, or reach the network.

`gate:serial` runs `showcase:links`, `ci:check`, `ci:build`, `ci:test`, `react:gate`, `ssr:smoke`
and `package:graph` in that order, because each writes or reads generated files: packages' `dist`,
packed tarballs, the docs site's `.next` and `.source`. Steps outside it read only source, so they
run at the same time; `a11y` and `a11y:ci-speed` keep their Vite dependency caches apart. CI's
`quality-gates` job runs `vp run ready:checks` and its `accessibility` job runs `vp run a11y`:
together, `vp run ready`. On demand (`gh workflow run ci.yml --ref <branch>`), a `browsers` job runs
`vp run browsers` on Linux. When a job fails, its last step names the failed task. The contract test
`tests/quality-gates.test.ts` holds the workflow to those task names and fails if `ready:full`
misses a step of `ready`.

## CI and local runs

A step that passes locally should pass in CI. What differs between the two, and how the gate
covers it:

- **Speed.** GitHub's runner ran the a11y suite 5 to 7 times slower than an Apple-silicon laptop,
  and that is what made its flakes: focus, scroll and save races that a fast machine always wins.
  `vp run a11y:ci-speed` runs the suite with Chromium's CPU throttled 6 times
  (`Emulation.setCPUThrottlingRate`, set in `tools/a11y/tests/setup.ts` for `--mode ci-speed`), and
  the full gate runs it, never from cache. Running beside the other steps loads the machine
  further: stricter, and a little less repeatable, so rerun it alone before calling a failure a
  flake.
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
- **Environment.** Vite Task runs steps with a small set of environment variables. Behind a proxy,
  or to use `registry:e2e`'s `REGISTRY_E2E_*` switches, run it directly:
  `node --import tsx tools/registry/src/e2e.ts`.
- **Time zone and locale.** CI runs in UTC; laptops run in their own zone. Tests pass explicit
  `timeZone`, `locale` and `now`, so passing in both is also a check that nothing reads the host's.

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
vp run ci:test
vp run react:gate
vp run ssr:smoke
vp run registry:smoke
vp run package:graph
vp run a11y
```

`vp run ready` runs the same gates, in parallel where they don't share generated files. The SSR report includes its deterministic environment, server-markup hash, recoverable hydration errors, interaction result, and unmount result. The registry report validates any `registry-item.json` files under `registry/` plus a committed contract fixture so an empty source registry cannot make the schema smoke vacuous, then builds the registry and checks the output (see [Registry](#registry)).

`vp run calendar-temporal#build` also enforces the package's production ESM budget: at most 30 KiB
raw and 7 KiB gzip. Because the check reads the emitted artifact, the recursive CI build exercises
the same gate that runs before publication.

`vp run calendar-core#build` applies the same emitted-artifact check to the core surface: at
most 180 KiB raw and 46 KiB gzip. `vp run engine:gate` is the reproducible phase-1 audit. It runs the
repository check, the interval/DST/index/revision/cache/invalid-data matrices, dependency and packed
API checks, both production engine builds and size budgets, and the uncached protocol-v2 core
benchmark. The benchmark is a reference-hardware gate rather than a portable CI timing claim, so it
remains an explicit local task while its deterministic correctness and build checks also run in CI.

`vp run react:store` is the focused issue #25 gate. It checks and builds `calendar-react`, runs the
controlled/uncontrolled state matrix, two-root isolation, selector invalidation, injected-store and
cleanup checks, and verifies deterministic SSR/hydration. The production build check
(`packages/calendar-react/scripts/verify-public-api.mjs`) fails if the React client boundary is dropped or the runtime
outgrows its budget.

`vp run react:factory` is the focused issue #26 gate. It adds the typed factory, compound controls,
custom-view registry, diagnostics/capabilities, facade consumer, direct React 19 refs, deterministic
IDs, and public declaration checks. The facade test imports only supported package roots and fails
if its third-party view needs a cast or a private source path. The React package build also enforces
its 76 KiB raw / 20 KiB gzip production ESM budget.

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

## Registry

`vp run registry:smoke` runs in `ready`. It validates every `registry-item.json` under `registry/`
and a committed contract fixture, so an empty source registry can't make it vacuous, then builds the
registry with `shadcn build` into a temporary folder, offline, and checks the output: every import
resolves to a file, component or package the item's install provides, `calendar-full` installs
every other item and owns no files, no two items write the same file, nothing depends on a
drag-and-drop library, and each range holds for the workspace versions. `vp run registry#fixture:known-bad`
must fail.

`vp run registry:e2e` is the full-tier install test. It needs the network for npm and shadcn's own
components, takes 15 to 35 seconds once the pnpm store is warm, and isn't part of `ready`. It
makes clean Vite and Next.js apps with `shadcn init`, runs `shadcn add <url>/calendar-full.json`
against the registry served from a local server, checks the files, aliases, package.json and
installed runtime, then typechecks and builds both apps. The runtime packages come from the workspace, packed and served from a local npm
registry for the `@moltenship` scope, until `REGISTRY_E2E_PACKAGES=npm` switches the test to the
published ones. `registry/README.md` lists its other switches.

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
