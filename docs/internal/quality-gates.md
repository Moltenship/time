# Quality gates

Issue #15 makes the repository's compatibility checks executable before calendar feature code lands. CI and local development run the same named Vite+ tasks.

CI runs on Node.js 26, the server-runtime floor where the suite exercises native `Temporal` without
a V8 feature flag or bundled polyfill.

## Passing gates

From the workspace root:

```sh
vp install
vp run ci:check
vp run ci:build
vp run ci:test
vp run react:gate
vp run ssr:smoke
vp run registry:smoke
vp run package:graph
```

`vp run ready` runs the same sequence. The SSR report includes its deterministic environment, server-markup hash, recoverable hydration errors, interaction result, and unmount result. The registry report validates any `registry-item.json` files under `registry/` plus a committed contract fixture so an empty source registry cannot make the schema smoke vacuous, then builds the registry and checks the output (see [Registry](#registry)).

`vp run calendar-temporal#build` also enforces the package's production ESM budget: at most 30 KiB
raw and 7 KiB gzip. Because the check reads the emitted artifact, the recursive CI build exercises
the same gate that runs before publication.

`vp run calendar-core#build` applies the same emitted-artifact check to the core surface: at
most 96 KiB raw and 24 KiB gzip. `vp run engine:gate` is the reproducible phase-1 audit. It runs the
repository check, the interval/DST/index/revision/cache/invalid-data matrices, dependency and packed
API checks, both production engine builds and size budgets, and the uncached protocol-v2 core
benchmark. The benchmark is a reference-hardware gate rather than a portable CI timing claim, so it
remains an explicit local task while its deterministic correctness and build checks also run in CI.

`vp run react:store` is the focused issue #25 gate. It checks and builds `calendar-react`, runs the
controlled/uncontrolled state matrix, two-root isolation, selector invalidation, injected-store and
cleanup checks, and verifies deterministic SSR/hydration. The production declaration audit fails if
Jotai enters the public API or if the React client boundary is dropped.

`vp run react:factory` is the focused issue #26 gate. It adds the typed factory, compound controls,
custom-view registry, diagnostics/capabilities, facade consumer, direct React 19 refs, deterministic
IDs, and public declaration checks. The facade test imports only supported package roots and fails
if its third-party view needs a cast or a private source path. The React package build also enforces
its 50 KiB raw / 13.5 KiB gzip production ESM budget.

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
