# ADR 0020: Compose row and time virtualizers around one native viewport

- Status: Accepted for the resource-view implementation phase
- Date: 2026-08-15
- Issue: [#20](https://github.com/Moltenship/time/issues/20)

## Context

The resource timeline must keep hundreds of resource rows and a long time range responsive while
preserving sticky axes, keyboard focus, SSR usefulness, RTL behavior, and subpixel alignment. A
naive resource-by-time render is `500 × 336 = 168,000` grid cells before labels and headers. Moving
sticky axes inside transformed virtual items also creates containing-block and stacking failures.

The spike evaluated the current TanStack Virtual 3 React adapter (`3.14.9`) as an internal
implementation detail, using deterministic fixed-size estimates that match this prototype's row and
slot contracts.

## Decision

Use one vertical virtualizer for resources and one horizontal virtualizer for time slots, composed
over the same native scroll viewport.

- Render only the Cartesian product of the two visible ranges. Keep time and resource axes in
  sibling scroll containers outside the virtual item canvas and synchronize their two scroll
  offsets once per animation-frame sample.
- Key both axes with stable domain IDs. Keep all virtualizer callbacks referentially stable so a
  React commit does not invalidate TanStack's measurement memo and reread the full resource set.
- Store roving focus as a resource ID, not an item node or visible index. Scroll the ID into range,
  focus it after commit, and restore focus if its node was virtualized away and later returns.
- Provide `initialRect` and `initialOffset` on both virtualizers. A custom rectangle observer keeps
  that deterministic rectangle when an environment reports `0 × 0`, then uses non-zero browser
  measurements. Disable adapter `flushSync` so React 19 hydration and StrictMode do not force sync
  updates from lifecycle work.
- Set horizontal `isRtl` from the calendar direction, preserve the current logical time offset when
  direction changes, then reconcile the viewport, time axis, and virtualizer to the new raw native
  `scrollLeft` before exposing settled browser state. Use logical CSS placement and snap authored
  item boundaries to the configured placement scale.
- Keep instrumentation in the spike: DOM counts, visible ranges, projected cells, React commits,
  axis writes, key/resource reads per scheduled frame, actual rendered-boundary error against
  `window.devicePixelRatio`, and an explicit full-resource-frame-scan counter. A configured
  placement scale that differs from the physical grid must be reported as misaligned.

## Evidence

The production browser probe bounded the logical `500 × 336` surface to at most 25 resource rows,
17 time slots, and 425 grid cells during the recorded LTR/RTL traces. Sticky-axis deltas were `0px`,
axis synchronization performed exactly two writes per sample, device-pixel error was zero at DPR 2,
and no sample read all 500 resource keys. Focus moved from resource 240 to 241 and returned to 241
after its DOM node was virtualized away. Full results and reproduction steps are in
[`docs/internal/evidence/issue-20-browser.md`](../internal/evidence/issue-20-browser.md).

Automated tests also cover deterministic repeated SSR output, exact StrictMode hydration without a
recovery, RTL initial markup, focus restoration, stable IDs, two-write synchronization, pixel
snapping at DPR 1, 1.25, 1.5, 2, and 3, nonzero LTR↔RTL transitions, and a rendered fractional-pixel
positive control that the browser-facing assertion rejects.

## Consequences

- DOM and application-owned per-frame work scale with visible rows and slots, not the full logical
  grid. Two virtualizers remain a local view concern; calendar state does not depend on TanStack.
- The initial rectangle is a product contract. Responsive consumers may enhance it only after a
  non-zero client measurement, so the first server and client trees stay identical.
- Focus can temporarily fall back to the document body while its row is absent. The stable ID lets
  the row reclaim focus when it returns, but screen-reader/browser combinations still require a
  dedicated accessibility matrix before production rollout.
- Raw RTL `scrollLeft` conventions stay encapsulated in the direction reconciler, virtualizer, and
  axis synchronizer. Direction changes preserve the logical time range rather than resetting it.
- Fixed estimates make placement deterministic. Variable-height resources would require anchored
  measurement and a renewed scroll-stability proof.

## Reversal triggers

Reconsider this decision if production-like traces show any frame reading all resources, the
visible-range DOM exceeds its overscan-derived bound, sticky-axis drift exceeds one device pixel,
focus cannot be retained across the supported accessibility matrix, or a TanStack upgrade breaks
the deterministic SSR/RTL contract. Also re-evaluate a maintained data-grid library if requirements
expand to variable row heights, nested pinned columns, or spreadsheet-grade selection.
