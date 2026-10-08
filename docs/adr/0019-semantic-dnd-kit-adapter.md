# ADR 0019: Keep dnd-kit behind a semantic calendar adapter

- Status: superseded by [ADR 0037](./0037-native-pointer-events.md). Production pointer input uses native Pointer Events; this spike stays as history.
- Date: 2026-08-15
- Spike: issue #19

## Context

The calendar needs pointer, touch, and keyboard movement without making drag-and-drop library state part of its public API or React render model. Pointer work must stay below the architecture's 4 ms/frame scripting gate, cause zero calendar React commits, avoid one droppable per slot, and still produce the same semantic change as keyboard input. The selected dnd-kit packages are currently pre-1.0, so replacement must remain practical.

The isolated spike pins `@dnd-kit/react` and `@dnd-kit/dom` at `0.1.21`. It exercises the current provider, pointer and keyboard sensors, overlay, modifier, accessibility plugin, source fallback during reparenting, and cancellation behavior.

## Decision

Use the current dnd-kit React and DOM packages for the production adapter, subject to these boundaries:

1. The calendar owns the only public inputs and output. Every completed interaction emits one `CalendarEventChange`; no dnd-kit type crosses the adapter entry point.
2. A view registers one geometric droppable surface. A precomputed `CalendarViewRegionGeometry` maps coordinates to snapped time and a pre-indexed resource column.
3. Pointer coordinates and the pending placement live in a mutable adapter-local session. Pointer movement does not write React state. React renders the source and the dnd-kit overlay; the future view renderer may apply high-frequency CSS transforms directly.
4. Pointer, touch, and keyboard sensors share the same semantic session. Touch uses delayed activation with tolerance, while keyboard arrows use the same snap and resource geometry as pointer movement.
5. The adapter uses dnd-kit's overlay, restriction modifier, cursor, feedback, selection-prevention, and accessibility plugins. Announcement copy is calendar-owned and localizable.
6. The built-in auto-scroller is not used. The calendar-owned rAF scroller coalesces a burst to one scheduled frame and performs at most one surface rectangle read in that frame.
7. Pin both dnd-kit packages to the same exact version. Upgrade them only with the focused contract and interaction traces in this spike.

The spike remains disposable under `tools/dnd-adapter-spike`; issue #37 will move the boundary into the production topology owned by issue #13 and use the canonical transaction contract owned by issue #35.

## Evidence

The committed [interaction trace](../../tools/dnd-adapter-spike/artifacts/interaction-trace.json) records:

- 240 manager-level pointer movements and zero React commits in the profiled calendar view;
- equivalent pointer, touch, and keyboard proposals;
- one view-region droppable, two configured sensors, an overlay, and a live announcement region;
- 0.0407 ms observed p95 manager-level scripting on the recorded machine;
- one geometry read for the first frame of a 100-update auto-scroll burst, with continuous follow-up and cancellation;
- source continuity across unregister/re-register, no proposal on cancel, and canceled/empty registries after unmount;
- a 10,389-byte ESM production build (3,421 bytes gzip) with React and dnd-kit externalized.

The trace was refreshed against production-source commit `4a617f86e228` after the pointer-origin and announcement-order fixes and the React 19.2.7 base synchronization. Its `baselineCommit` records the synchronized `main` base, while `measuredCommit` identifies the exact implementation under measurement.

The timing is a deterministic test-harness trace, not a browser frame benchmark. It establishes the update topology and catches regressions cheaply. Issue #37 must repeat the under-4-ms measurement with a production browser build and actual pointer events before issue #38 can close.

## Consequences

- Application code sees stable calendar concepts even if the dnd-kit API changes.
- A library upgrade is localized to the provider, overlay, sensor, modifier, and internal data mapping.
- Geometry refresh after scroll, resize, virtual-range changes, or auto-scroll remains a responsibility of the production view adapter; the spike only proves the hot-path shape.
- The current dnd-kit accessibility announcement callback types need a small internal structural type because the configured plugin's inherited static typing is less specific than its runtime event shape. That type is private.
- happy-dom needs shims for CSS individual transforms and Web Animations. Real browser, touch-device, focus-restoration, and screen-reader behavior remain production gate evidence, not claims of this spike.
- SSR is not a functional concern for a drag session, but the package builds without reading DOM globals at module scope. Interactive behavior is client-only.

## Reversal trigger

Replace dnd-kit, or hold its pinned version, if any of the following occurs:

- a supported browser cannot preserve source identity through reparent/unmount/cancel;
- pointer movement requires calendar React commits or exceeds 4 ms p95 in the production browser trace;
- sensor, overlay, modifier, or accessibility changes cannot be contained inside this adapter;
- announcements, keyboard parity, focus restoration, or touch activation fail the interaction gate;
- the 0.x line becomes unmaintained or introduces incompatible React/browser support.

Because the public contract and geometry are calendar-owned, reversal replaces the adapter implementation rather than consumer code.
