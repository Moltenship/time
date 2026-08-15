# Issue #25 React store and SSR evidence

- Date: 2026-08-15
- Issue: [#25](https://github.com/Moltenship/time/issues/25)
- Package: `@moltenship/calendar-react`

## Implemented contract

- One injected or internally owned Jotai vanilla store per calendar instance; no provider-less
  global store.
- Six independently controlled/uncontrolled slices: view, anchor date, selection, focus, timezone,
  and expanded resource IDs.
- Synchronous render-scoped derived atoms for controlled values, with no effect mirror.
- Immutable cached snapshots and identical `getSnapshot()`/`getServerSnapshot()` reads.
- Stable semantic commands through one private Jotai write atom and the latest committed handlers.
- `useAtomValue`, `useSetAtom`, and `selectAtom` for React reads, dispatch, equality, subscription,
  and unmount cleanup.
- Caller-owned injected stores survive unmount; internally owned stores are destroyed once, including
  under Strict Mode effect replay.
- Packed declarations expose only calendar state/actions/meta types.

The production decision and its difference from the Phase 0 handwritten adapter are recorded in
[ADR 0025](../adr/0025-native-jotai-react-bindings.md).

## Focused gate

`vp run react:store` passed:

- package formatting, lint, and type checking with no findings;
- 3 test files and 11 tests;
- production package build at 9.95 kB raw / 2.32 kB gzip;
- declaration/client-boundary audit.

The tests cover cached immutable snapshots, all six state commands, the full controlled callback
matrix, controlled backing-atom dependency elision, destroyed-store rejection, foreign-source
rejection, stable latest-handler dispatch, selector isolation, two-root isolation, injected-store
ownership, internally owned cleanup, Strict Mode, deterministic server rendering, hydration without
recovery or console errors, and post-hydration interaction.

## Repository gates

| Command | Result |
| --- | --- |
| `vp check` | 196 files formatted; 140 files with no lint or type errors |
| `vp test` | 25 files and 144 tests passed |
| `vp run -r build` | 22 of 22 recursive build tasks passed |
| `vp run ssr:smoke` | Stable server hash, no recoverable errors, no hydration mutation, interaction count 1, clean unmount |
| `git diff --check` | Passed |

The headless task changes no visual surface, so its required runtime artifact is the SSR/hydration
record rather than a browser screenshot or accessibility scan.
