# Resource virtualization spike

This package is the isolated implementation probe for GitHub issue #20. It renders a logical
`500 × 336` resource timeline with two TanStack Virtual 3 virtualizers sharing one native scroll
viewport.

## What it proves

- Resource and time items use stable domain keys.
- The resource and time axes are scroll-synchronized siblings of the virtual canvas, so virtual
  item transforms cannot change their containing block.
- Initial `900 × 520` geometry is deterministic on the server and is retained through StrictMode
  hydration until a browser supplies a non-zero measured rectangle.
- Only visible rows and time slots are projected into cells. The browser API reports DOM bounds,
  key/resource reads per scheduled frame, axis writes, placement error, and full-resource scans.
- Roving focus is stored by resource ID, restored when a row returns to the virtual window, and
  supports Arrow Up/Down, Home, and End.
- RTL uses logical placement plus TanStack Virtual's `isRtl` offset normalization. A direction
  change preserves the logical time range while reconciling the viewport, time axis, and
  virtualizer to the new native `scrollLeft` convention.
- Geometry is authored against a configurable placement scale, while browser evidence measures
  the rendered start and end boundaries against the actual `window.devicePixelRatio`.

## Run it

From this directory:

```sh
vp check
vp test --run
vp build
vp preview --host 0.0.0.0 --port 4173
```

In a browser console, inspect or drive the probe through:

```js
window.__resourceTimelineSpike.readEvidence();
window.__resourceTimelineSpike.assertDevicePixelPlacement();
await window.__resourceTimelineSpike.runScrollProbe();
await window.__resourceTimelineSpike.setDirection("rtl");
await window.__resourceTimelineSpike.focusResource(239);
```

The browser measurements captured for the decision are in
[`docs/internal/evidence/issue-20-browser.md`](../../docs/internal/evidence/issue-20-browser.md).
