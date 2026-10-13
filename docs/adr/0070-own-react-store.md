# ADR 0070: `calendar-react` owns its store

- Status: Accepted
- Date: 2026-10-08
- Issue: [#70](https://github.com/Moltenship/time/issues/70), in PR #80
- Supersedes: [ADR 0025](./0025-native-jotai-react-bindings.md)

## Context

ADR 0025 kept each calendar's uncontrolled slices in a Jotai vanilla store, read through Jotai's
React bindings and `selectAtom`. #70 rebuilt how `Root` and the store meet, to fix bugs in that
seam:

- with a controlled `view`, `store.actions.setView` skipped `onViewChange`;
- the store had no `subscribe` for code outside React;
- two `navigateNext()` calls in one handler advanced once;
- inline controlled values, such as `anchorDate={PlainDate.from(iso)}`, and inline selectors changed
  identity on every render.

The fixes live in a binding the calendar owns between each mounted `Root` and the store: the root's
controlled slices, handlers and pending requests. With them there, the store only has to hold six
values and tell subscribers when one changes.

## Decision

`calendar-react` has a store of its own (`store.ts`): a frozen snapshot of the six slices, a listener
set, `getSnapshot()`, `subscribe()` and six `set*` actions. React reads it with
`useSyncExternalStore`, and `useCalendarStateBinding` overlays the controlled props on its snapshot
during render. Jotai is no longer a dependency. The store's internals stay private: public hooks
select semantic state. `architecture.md` §9.1 and §9.2 describe it.

## Consequences

- `calendar-react` has no runtime dependency outside the workspace.
- The guarantees ADR 0025 relied on Jotai for still hold, against the package's own store: no
  effect mirror, controlled values current in the render that receives them, selector equality,
  isolated roots, and subscription cleanup across unmount and `Activity`, which
  `useSyncExternalStore` owns.
- The package keeps its own listener set and snapshot identity, which Jotai used to.
- `getServerSnapshot()` and `store.destroy()` are gone. Inside `Root`, the server and the first
  client render read the same merged state; a store `Root` created is dropped with it.
- Jotai stays in the workspace only for `tools/react-store-spike` (ADR 0018).

## Evidence

`packages/calendar-react/tests/react-gate.test.tsx` (controlled state in every Strict Mode render,
selectors that don't commit unrelated changes, isolated roots, a caller-owned store after unmount),
`store.test.ts`, and the Activity cases in `view-projection.test.tsx` and `regressions.test.tsx`.
`vp run react:gate` runs the first, and `vp test` all of them.
