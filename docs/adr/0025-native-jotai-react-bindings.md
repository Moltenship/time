# ADR 0025: Native Jotai bindings for the production React store

- Status: Accepted
- Date: 2026-08-15
- Issue: [#25](https://github.com/Moltenship/time/issues/25)
- Supersedes in production: the handwritten subscription adapter from the
  [Phase 0 React spike](./0001-controlled-react-store-spike.md)

## Context

The Phase 0 spike proved that render-scoped readers can combine controlled props with an isolated
Jotai vanilla store without an effect mirror. Its disposable adapter also implemented revision
counters, snapshot caches, listener fan-out, selector caches, and React external-store wiring by
hand. Jotai 2 already owns those mechanisms through derived atoms, `selectAtom`, and its React
bindings. Keeping both layers would duplicate invalidation logic and public types without adding a
calendar-specific guarantee.

The production package must still expose calendar-owned `{ state, actions, meta }` contracts and
must not make Jotai atoms or store types public.

## Decision

Each calendar instance owns one Jotai vanilla store and one primitive atom for each uncontrolled
slice. A state source is a derived atom that closes over the current controlled props. A controlled
branch returns the prop directly; an uncontrolled branch reads its primitive atom. Jotai therefore
caches immutable snapshots and tracks only the backing atoms actually read by that source.

React reads source atoms with `useAtomValue` and dispatches one private write atom with `useSetAtom`.
Public selector hooks wrap the source with `selectAtom`, including its equality option. Selector
references follow Jotai's stability contract: define them outside render or memoize closures.

The non-React `getSnapshot()` and `getServerSnapshot()` methods both read the same derived atom.
They remain useful for orchestration and deterministic SSR assertions, but React does not duplicate
Jotai's subscription protocol with a custom `useSyncExternalStore` adapter.

The calendar keeps a thin semantic command layer for controlled callback dispatch, Temporal and
resource-ID equality, source ownership checks, store injection, and explicit orchestration
destruction. React Effect cleanup never permanently destroys the logical store: React `Activity`
disconnects Effects while preserving hook state for a later reveal. Mapped public types derive
controlled state, actions, and change-handler names from `CalendarPublicState`.

## Consequences

- Revision counters, listener registries, snapshot caches, selector caches, and explicit selector
  dependency lists are removed from calendar code.
- A controlled source does not depend on the corresponding backing atom, so backing changes do not
  invalidate its cached snapshot.
- Jotai's React bindings own reversible subscription setup and cleanup across Activity hide/reveal
  and final unmount. An internally created pure store becomes garbage-collectable with its hook
  state; an injected store remains caller-owned.
- `store.destroy()` remains an explicit, irreversible orchestration command and is not coupled to a
  React Effect cleanup.
- Stable semantic actions use the latest committed source and handlers.
- Jotai remains replaceable because packed declarations contain only calendar-owned types.

## Evidence

The issue #25 package suite proves controlled/uncontrolled behavior, controlled backing-atom
elision, cached snapshots, stable actions, selector invalidation, root isolation, injected-store
ownership, Strict Mode cleanup, and server/hydration equality. The production declaration audit
rejects Jotai types and a missing React client boundary.
