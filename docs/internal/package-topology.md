# Package topology and ownership

This document turns the dependency law in [architecture.md](../../architecture.md) into repository
ownership. A workspace may import only the public entry points of workspaces listed in its
`dependencies`; importing another workspace's `src/` tree is always invalid.

Version 2.0 adds a plane and two packages (#275, ADR 0275): the framework-free
`calendar-primitives`, written on ui-sdk, between the engine and the framework integrations, and
`calendar-solid` beside `calendar-react`. Both are on npm in `2.0.0-beta.1`, a pre-release, and still
in progress. `architecture.md` §2 says what is built. Where this document says "2.0", the 1.x line doesn't have it.

Entry points expose only contracts approved by their owning implementation issues. Calendar core
and Temporal expose the canonical engine contracts. Calendar React exposes its state/SSR layer and
the issue #26 factory, compound context, and custom-view surface. The internal benchmark
workspace owns reproducible data and performance protocol code. `calendar-testing`
exposes the test harness apps use (#45), built on the facade's and recurrence's public API only.

Publishable workspaces expose `src/index.ts` inside the checkout so declared package imports work
before any ignored build output exists. pnpm applies each package's `publishConfig.exports` while
packing, replacing that development entry with `dist/index.mjs` and `dist/index.d.mts`.

## Published packages

Eleven packages will publish to npm under `@moltenship`: `calendar`, `calendar-core`,
`calendar-dnd`, `calendar-dnd-kit`, `calendar-react`, `calendar-recurrence`, `calendar-temporal`,
`calendar-testing`, `ics` and, new in 2.0, `calendar-primitives` and `calendar-solid`. All eleven
share one version. The list, with each entry point's size budget, is in [`tools/release/src/config.ts`](../../tools/release/src/config.ts);
[releasing.md](./releasing.md) covers versions, release checks and publishing.

Every published package ships the root MIT `LICENSE`. pnpm adds it to a package's tarball when no
packed file's path contains `license` or `licence`, in any case (`THIRD-PARTY-LICENSES.md` or
`dist/licenses.mjs` would count), so don't give a packed file such a name. `npm pack` doesn't do
this: pack with pnpm.

`ics` is `MIT AND Unicode-3.0`: it bundles Unicode CLDR's Windows time zone mapping. The Unicode
License v3 ships in its `THIRD-PARTY-NOTICES.md`, and as a `/*!` comment in its built code, which
bundlers keep.

`tests/package-metadata.test.ts` checks the published set and the `license`, `repository`,
`homepage` and `bugs` fields. It checks that each tarball lists `README.md` and `LICENSE`, and that
`ics`'s also lists `THIRD-PARTY-NOTICES.md`, whose license text matches the generated source's `/*!`
comment and whose CLDR release matches its header. `tests/ics-boundary.test.ts` checks that the
packed code carries the `/*!` notice.

## Workspace ownership

| Workspace | Plane and ownership | Allowed workspace imports |
| --- | --- | --- |
| `@moltenship/calendar-temporal` | Engine: type-specific Temporal utilities | None |
| `@moltenship/calendar-core` | Engine: snapshots, indexes, projections, layouts, and transactions | `calendar-temporal` |
| `@moltenship/calendar-primitives` | Primitives (2.0): the calendar runtime, the calendar store, the calendar as a ui-sdk primitive, the agent surface. No framework | `calendar-core`, `calendar-temporal` |
| `@moltenship/calendar-react` | React integration: provider, selectors, actions, and headless parts | `calendar-core`, `calendar-temporal`; in 2.0 also `calendar-primitives` and `calendar-dnd`, which its `useCalendarPointer` binds |
| `@moltenship/calendar-solid` | Solid integration (2.0): the same for SolidJS 2.0. Never `calendar-react`, the facade or another package with a React peer | `calendar-core`, `calendar-primitives`, `calendar-temporal`; `calendar-dnd` |
| `@moltenship/calendar-dnd` | Pointer interaction adapter (native Pointer Events); framework-free in 2.0, its tests too: its React hook is `calendar-react`'s | `calendar-core`, `calendar-temporal` |
| `@moltenship/calendar-dnd-kit` | Optional dnd-kit adapter: items dragged into the calendar, events dragged out (#237) | `calendar-core`, `calendar-dnd` |
| `@moltenship/calendar` | Supported public facade, for React | `calendar-core`, `calendar-dnd`, `calendar-react`, `calendar-temporal` |
| `@moltenship/calendar-testing` | Test helpers for apps: environment, builders, fixtures, render and hydration harness, queries, drivers and assertions (#45) | Public facade and `calendar-recurrence` |
| `@moltenship/calendar-recurrence` | Recurrence layer: RRULE expansion, occurrences, series edits (ADR 0048) | `calendar-core`, `ics` |
| `@moltenship/ics` | Standalone iCalendar parsing (ADR 0151) | None |
| `showcase` | Consumer-equivalent documentation and examples, for React and for Solid | Public facade, `calendar-recurrence`, `calendar-dnd-kit`, `calendar-temporal`, `calendar-testing` and `@moltenship/ics`; `calendar-solid` and `calendar-core` as dev dependencies, for the Solid docs' samples, which it type-checks and never imports |
| `ssr-fixture` | Consumer-equivalent SSR/hydration verification | Public facade; its tests also use `calendar-testing` |
| `benchmark` | Internal core and recurrence benchmark runners, with their fixtures | Core, recurrence and Temporal utilities |
| `demo` | The Google Calendar-style demo app. Its build also builds `demo-solid` into `dist/solid`, and its dev server serves it at `/solid/` (`apps/demo/vite.config.ts`) | Public facade, `calendar-recurrence` and `calendar-dnd-kit`; `demo-solid` as a dev dependency, which it builds and never imports |
| `demo-solid` | The demo's app in Solid 2.0, on the Solid registry's views; the one app that compiles Solid JSX (the docs' samples compile theirs in a test) | `calendar-solid`, and the engine packages it needs, through public entries; the demo's framework-free modules by path (`@demo/*`, `apps/demo/src`), which reach no React (`apps/demo-solid/tests/shared-modules.test.ts`) |
| `registry-source` | Registry source, type-checked and tested in place | Public facade only; its tests also use `calendar-testing` |
| `a11y` | Internal axe and interaction suite (`tools/a11y`) | Public facade, `calendar-recurrence`, the dnd-kit adapter, `calendar-testing`, registry source in place (`@registry/*`), and the demos' `App`s by path (`apps/demo/src/app` and `apps/demo-solid/src/app`); not in the manifest check yet |
| `registry` | Internal shadcn build, validation and install test (`tools/registry`) | None |
| `release` | Internal release tooling: size budgets, API reports, export checks, clean-consumer install, dry run, publish | None; it reads built and packed packages from disk |

External dependencies are added by the issue that validates their contract. React 19 is a peer of
`calendar-react`, `calendar-dnd-kit`, `calendar` and `calendar-testing`, and React DOM 19 of
`calendar-testing`; `calendar-dnd` had a React peer in 1.x and has none in 2.0. In 1.x `calendar-react` has no runtime dependency outside the
workspace; it dropped Jotai in #70 (ADR 0070).

2.0 adds ui-sdk and Solid, as peers only (#275, ADR 0275). `@ui-sdk/core` is a peer of
`calendar-primitives`, `calendar-react` and `calendar-solid`: an application's agent bridge has to
share one copy of it with the calendar. `@ui-sdk/react` is a peer of `calendar-react`, and
`@ui-sdk/solid`, `solid-js` and `@solidjs/web` of `calendar-solid`. The facade and
`calendar-testing` bring `calendar-react`, so they declare its ui-sdk peers as well, though their
source imports none of it. ui-sdk is pre-1.0: the catalog pins one version for all of its packages, every
peer range is a caret that starts at it, `tests/package-metadata.test.ts` holds them together, and
an upgrade moves all of them in one pull request. Only the primitives, the two integrations and the
applications that show them import `@ui-sdk/*`, through its public entries, and only
`calendar-solid`, `demo-solid` and the samples of the Solid docs
(`apps/showcase/content/examples/solid`) import Solid.

`calendar-core` depends on `@flatten-js/interval-tree` behind its
internal `IntervalIndex` (ADR 0016). dnd-kit (`@dnd-kit/react` and `@dnd-kit/dom` 0.5) is a peer
of `calendar-dnd-kit` alone, which no other package depends on; the `a11y` tests use it with the
adapter. The adapter also depends on `@dnd-kit/abstract`, which `@dnd-kit/dom` brings, for
dnd-kit's collision enums. TanStack Virtual is a registry-source dependency, not a package one. Playwright and
axe-core are `tools/a11y` development dependencies.

Every workspace compiles with the cataloged current TypeScript toolchain against the `ESNext`
standard library. Temporal is an ambient global, so `calendar-temporal` has no declaration
dependency and does not re-export the platform namespace. ADR 0004 owns the compiler and runtime
boundary.

## Consumption flow

```text
calendar-temporal
       ↓
calendar-core + calendar-temporal ─────→ benchmark
       ↓
calendar-core + calendar-temporal → calendar-react
calendar-core + calendar-temporal → calendar-dnd
calendar-core + calendar-dnd → calendar-dnd-kit (optional; dnd-kit peer) ─────→ showcase / demo / a11y

calendar-core + calendar-dnd + calendar-react + calendar-temporal
       ↓
calendar (facade) ─────→ showcase / ssr-fixture / demo / registry-source / a11y
       ↓
calendar-testing (also imports calendar-recurrence) ─────→ showcase

calendar-core + ics ─────→ calendar-recurrence ─────→ showcase / demo / benchmark / a11y

ics (standalone: no workspace imports, no runtime dependencies) ─────→ showcase
```

2.0 puts the primitives between the engine and the integrations. The rest of the flow stays:

```text
calendar-core + calendar-temporal → calendar-primitives (ui-sdk core peer; no framework)
       ↓
calendar-primitives + calendar-dnd + calendar-core + calendar-temporal → calendar-react (React, ui-sdk React peers)
calendar-primitives + calendar-core + calendar-temporal → calendar-solid (Solid, ui-sdk Solid peers) ─────→ demo-solid

calendar-react ⇸ calendar-solid, and calendar-solid ⇸ calendar-react, the facade or any package with a React peer
```

`calendar-dnd` keeps its place, with no framework: `useCalendarPointer` is `calendar-react`'s, and
`calendar-solid` may import the adapter to bind it the same way; `calendar-primitives` never does.

Registry item directories are consumer-owned source boundaries, not npm packages. Of our packages,
they import only the `@moltenship/calendar` facade, which the `registry-source-uses-calendar-facade` rule enforces,
and published packages must never import registry, application, benchmark, or tool source. The
registry's tests aren't installed: they may also use `@moltenship/calendar-testing`, as an app's
tests would (`registry-tests-use-the-facade-and-the-harness`).

## Enforcement

`vp run check:boundaries` uses dependency-cruiser to validate source edges and Vitest to validate
the workspace manifest graph. The same test runs dependency-cruiser against a deliberately invalid
fixture and passes only when the expected deep-import violation is reported. Core, Temporal and
`ics` configuration is also asserted to omit DOM libraries and ambient package types.

The 2.0 rules (`architecture.md` §2, rules 12 to 15) are checked the same way, with invalid
fixtures of their own; that enforcement is in progress. What it has to hold: the primitives import
no framework, no ui-sdk renderer and, of ours, only core and the Temporal utilities; neither
integration imports the other or the other's framework; `@ui-sdk/*` is imported only by the
primitives, the integrations and the applications that show them, never through an `internal`,
`dist` or `src` path and never its date, Calendar or Timeline entries from a package; Solid only by
`calendar-solid`, `demo-solid` and the Solid docs' samples; and the catalog and the `@ui-sdk/*` peers move together.

Dependency-cruiser 18 uses an isolated TypeScript 6 parser through `packageExtensions` because its
boundary analysis does not yet work with TypeScript 7. This exception is tooling-only: Vite+ and
every workspace compile with the cataloged current TypeScript toolchain.
The release clean-consumer check also compiles with TypeScript 6, the oldest the README supports.
