# Package topology and ownership

This document turns the dependency law in [architecture.md](../../architecture.md) into repository
ownership. A workspace may import only the public entry points of workspaces listed in its
`dependencies`; importing another workspace's `src/` tree is always invalid.

Entry points expose only contracts approved by their owning implementation issues. Calendar core
and Temporal expose the canonical engine contracts. Calendar React exposes its state/SSR layer and
the issue #26 factory, compound context, and custom-view surface. The internal fixtures and
benchmark workspaces own reproducible data and performance protocol code; other workspace shells
stay empty until their implementation and validation issues land.

Publishable workspaces expose `src/index.ts` inside the checkout so declared package imports work
before any ignored build output exists. pnpm applies each package's `publishConfig.exports` while
packing, replacing that development entry with `dist/index.mjs` and `dist/index.d.mts`. The private
`fixtures` workspace follows the same type-checking rule but keeps its runtime import on built
`dist/`, which is the artifact consumed by `benchmark`.

## Published packages

Seven packages will publish to npm under `@moltenship`: `calendar`, `calendar-core`,
`calendar-dnd`, `calendar-react`, `calendar-recurrence`, `calendar-temporal` and `ics`.
`calendar-testing` is an empty stub and stays `private` until after 1.0 (#45).

Every published package ships the root MIT `LICENSE`. pnpm adds it to a package's tarball when no
packed file's path contains `license` or `licence`, in any case (`THIRD-PARTY-LICENSES.md` or
`dist/licenses.mjs` would count), so don't give a packed file such a name. `npm pack` doesn't do
this: pack with pnpm. `tests/package-metadata.test.ts` checks the
published set, the `repository`, `homepage` and `bugs` fields, and that each tarball lists
`LICENSE`.

## Workspace ownership

| Workspace | Plane and ownership | Allowed workspace imports |
| --- | --- | --- |
| `@moltenship/calendar-temporal` | Engine: type-specific Temporal utilities | None |
| `@moltenship/calendar-core` | Engine: snapshots, indexes, projections, layouts, and transactions | `calendar-temporal` |
| `@moltenship/calendar-react` | React integration: provider, selectors, actions, and headless primitives | `calendar-core`, `calendar-temporal` |
| `@moltenship/calendar-dnd` | Optional interaction adapter | `calendar-core`, `calendar-temporal` |
| `@moltenship/calendar` | Supported public facade | `calendar-core`, `calendar-dnd`, `calendar-react`, `calendar-temporal` |
| `@moltenship/calendar-testing` | Consumer test helpers; private until after 1.0 (#45) | Public facade, dnd adapter, and Temporal utilities |
| `@moltenship/calendar-recurrence` | Recurrence layer: RRULE expansion, occurrences, series edits (ADR 0048) | `calendar-core`, `calendar-temporal`, `ics` |
| `@moltenship/ics` | Standalone iCalendar parsing (ADR 0151) | None |
| `showcase` | Consumer-equivalent documentation and labs | Public facade, `calendar-recurrence` and `@moltenship/ics` |
| `ssr-fixture` | Consumer-equivalent SSR/hydration verification | Public facade only |
| `fixtures` | Internal deterministic fixture generation | `calendar-core` |
| `benchmark` | Internal core and React performance runners | Core, React bindings, recurrence, Temporal utilities, and fixture tooling |
| `demo` | The Google Calendar-style demo app | Public facade and `calendar-recurrence` |
| `registry-source` | Registry source, type-checked and tested in place | Public facade only |
| `registry` | Internal shadcn build, validation and install test (`tools/registry`) | None |

External dependencies are added by the issue that validates their contract. React 19 is a
`calendar-react` peer. `calendar-react` has no runtime dependency outside the workspace; it dropped
Jotai in #70, which ADR 0025 doesn't say yet (#184). The dnd-kit,
interval-tree, virtualization, and browser-test dependencies remain owned by their corresponding
implementation or harness issues.

Every workspace compiles with the cataloged current TypeScript toolchain against the `ESNext`
standard library. Temporal is an ambient global, so `calendar-temporal` has no declaration
dependency and does not re-export the platform namespace. ADR 0004 owns the compiler and runtime
boundary.

## Consumption flow

```text
calendar-temporal
       ↓
calendar-core ───────────────→ fixtures ───────→ benchmark (also imports core and temporal)
       ↓                                           ↑
calendar-core + calendar-temporal → calendar-react ┘
calendar-core + calendar-temporal → calendar-dnd

calendar-core + calendar-dnd + calendar-react + calendar-temporal
       ↓
calendar (facade) ─────→ showcase / ssr-fixture / demo / registry-source
       ↓
calendar-testing ← calendar-dnd / calendar-temporal

calendar-core + calendar-temporal + ics ─────→ calendar-recurrence ─────→ showcase / demo / benchmark

ics (standalone: no workspace imports, no runtime dependencies) ─────→ showcase
```

Registry item directories are consumer-owned source boundaries, not npm packages. They may consume
supported public packages once implemented, but published packages must never import registry,
application, benchmark, or tool source.

## Enforcement

`vp run check:boundaries` uses dependency-cruiser to validate source edges and Vitest to validate
the workspace manifest graph. The same test runs dependency-cruiser against a deliberately invalid
fixture and passes only when the expected deep-import violation is reported. Core and Temporal
configuration is also asserted to omit DOM libraries and ambient package types.

Dependency-cruiser 18 uses an isolated TypeScript 6 parser through `packageExtensions` because its
boundary analysis does not yet work with TypeScript 7. This exception is tooling-only: Vite+, the
packed-consumer test, and every workspace compile with the cataloged current TypeScript toolchain.
