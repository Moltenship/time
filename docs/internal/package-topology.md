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

## Workspace ownership

| Workspace | Plane and ownership | Allowed workspace imports |
| --- | --- | --- |
| `@moltenship/calendar-temporal` | Engine: type-specific Temporal utilities | None |
| `@moltenship/calendar-core` | Engine: snapshots, indexes, projections, layouts, and transactions | `calendar-temporal` |
| `@moltenship/calendar-react` | React integration: provider, selectors, actions, and headless primitives | `calendar-core` |
| `@moltenship/calendar-dnd` | Optional interaction adapter | `calendar-core`, `calendar-react` |
| `@moltenship/calendar` | Supported public facade | `calendar-core`, `calendar-react` |
| `@moltenship/calendar-testing` | Published consumer test helpers | Public facade, dnd adapter, and Temporal utilities |
| `@moltenship/calendar-recurrence` | Reserved post-1.0 engine | `calendar-core`, `calendar-temporal` |
| `showcase` | Consumer-equivalent documentation and labs | Public facade only |
| `ssr-fixture` | Consumer-equivalent SSR/hydration verification | Public facade only |
| `fixtures` | Internal deterministic fixture generation | `calendar-core` |
| `benchmark` | Internal core and React performance runners | Core, React bindings, and fixture tooling |
| `registry` | Internal shadcn schema/build verification | None until the registry harness lands |

External dependencies are added by the issue that validates their contract. React 19 is a
`calendar-react` peer and Jotai 2 is its private runtime dependency after issue #25. The dnd-kit,
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
calendar-core ───────→ fixtures ───────→ benchmark
       ↓                                ↑
calendar-react ─────────────────────────┘
       ├────────────→ calendar-dnd
       └────────────→ calendar (facade) ─────→ showcase / ssr-fixture
                              ↓
                      calendar-testing ← calendar-dnd / calendar-temporal

calendar-core + calendar-temporal ─────→ calendar-recurrence (reserved)
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
