# ADR 0018: Controlled React state reads through render-scoped external-store snapshots

- Status: Accepted for the Phase 0 prototype
- Date: 2026-08-15
- Issue: [#18](https://github.com/Moltenship/time/issues/18)
- Production follow-ups: #25 and #26

## Context

The calendar needs independently controlled and uncontrolled UI slices, isolated roots, deterministic SSR, and a typed compound API. Copying controlled props into atoms from `useEffect` creates a stale render and makes the server/client boundary harder to reproduce. Exporting Jotai atoms or store types would also turn an implementation choice into a public compatibility contract.

## Decision

The prototype creates one Jotai vanilla store for each `Calendar.Root`. Jotai owns only uncontrolled slice values and subscriptions. Each render creates a snapshot reader that closes over the current controlled inputs and combines them synchronously with the uncontrolled atoms.

The reader caches one immutable snapshot per internal store revision. Its `getSnapshot` and `getServerSnapshot` functions share the same cache and read no browser globals. A controlled prop therefore appears in the first render that receives it, while an uncontrolled action advances the store revision and notifies only that root. No effect bridges controlled props into atoms.

The typed factory closes over `TEvent` and `TResource`, creates its own React context, and returns compound components plus `defineView`/`CustomView`. Public declarations mention only calendar-owned state, actions, and meta types. Jotai remains private to the disposable runtime store module.

## Consequences

- React 19 receives referentially cached snapshots and identical initial server/client data.
- Strict Mode can recreate discarded stores without observable side effects.
- Two roots cannot share state accidentally because there is no provider-less store.
- Controlled action objects are render-scoped when ownership or callback props change. This is concurrency-safe because committed handlers retain their render's control contract, but consumers must not depend on action object identity in this spike.
- The experiment does not establish the future `calendar-react` directory, package name, or public release surface; issue #13 still owns topology, and #25/#26 own productionization.

## Reversal triggers

Revisit this choice before production if any of the following occurs:

1. React reports an uncached snapshot, hydration recovery, or tearing under the full concurrent/transition harness.
2. Production selectors cannot subscribe to independent slices without broad provider rerenders.
3. The Jotai adapter adds measurable commit or memory cost versus a smaller `useSyncExternalStore` store at target density.
4. A framework fixture needs an explicitly serialized bootstrap snapshot rather than reproducible input props.

If triggered, retain the public `{ state, actions, meta }` and typed-factory contracts, replace the private store adapter, and rerun the same evidence suite.

## Evidence

| Claim | Automated evidence |
| --- | --- |
| Controlled values never lag a render in Strict Mode | `controlled-store.test.tsx` records every render after a controlled action |
| Snapshots are cached | `controlled-store.test.tsx` proves referential identity across unchanged rerenders |
| Root stores are isolated | `controlled-store.test.tsx` updates one of two roots |
| Hydration is deterministic and interactive | `ssr-hydration.test.tsx` compares markup, captures recovery/console errors, updates after hydration, and unmounts |
| Event/resource generics reach public composition APIs | `typed-custom-view.test.tsx` compiles and renders a custom view and compound event callback without consumer casts |
| Jotai does not leak | The production build checks the emitted declaration for Jotai/escape-hatch types and the public consumer fixture for casts |

Validation commands:

```sh
vp check
vp run @moltenship/react-store-spike#test
vp run @moltenship/react-store-spike#test:ssr
vp run @moltenship/react-store-spike#build
```
