# ADR 0037: Native Pointer Events for calendar interaction

- Status: Accepted
- Date: 2026-10-08
- Issue: [#37](https://github.com/Moltenship/time/issues/37)
- Supersedes: [ADR 0019](./0019-semantic-dnd-kit-adapter.md)

## Context

ADR 0019 chose dnd-kit behind a semantic adapter. The calendar needs one geometric drop surface
per view, snapping through precomputed view geometry, a transform-only preview, rAF auto-scroll
and calendar-owned announcements. The adapter would bypass most of dnd-kit for those, while
depending on a pre-1.0 library whose API changed between 0.1 and 0.5.

## Decision

`@moltenship/calendar-dnd` handles pointer, touch and pen input with native Pointer Events:

1. Views render data attributes (`data-event-id`, `data-resize`, `data-date`) and one delegated
   region per view. The adapter maps pointer positions through the view's geometry to a snapped
   placement.
2. The drag preview moves by CSS transform and is clipped to the view's scroll viewport. Pointer
   movement does not write React state.
3. Every completed gesture emits one semantic change through the transaction pipeline (#35), the
   same as explicit actions and, from 0.2, keyboard input (#36). Escape cancels.
4. Touch uses long-press activation. Auto-scroll is calendar-owned and rAF-driven.

## Consequences

- No drag-and-drop library in production dependencies. dnd-kit can come back later as an
  optional adapter behind the same semantic contracts.
- Keyboard grab, move and resize are built in `calendar-core` and `calendar-react` (#36), not
  through a dnd-kit keyboard sensor.
- `tools/dnd-adapter-spike` stays as history and keeps its own tests.
