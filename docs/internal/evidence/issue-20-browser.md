# Issue #20 browser and SSR evidence

Captured 2026-08-15 from the production build served by `vp preview` on port 4173.

## Environment

- Browser: T3 Code Nightly `0.0.34-nightly.20260813.1086`, Chromium 146.0.7680.216
- Platform: macOS browser target (`MacIntel`)
- Viewport: `1280 × 800` CSS pixels
- Device pixel ratio: 2
- Logical data: 500 resources × 336 hourly slots (14 days)
- TanStack React Virtual: 3.14.9

## Initial production render

The browser API returned:

| Measurement | Result |
| --- | ---: |
| Resource rows / labels | 19 / 19 |
| Time headers | 13 |
| Grid cells | 247 |
| Total timeline descendants | 362 |
| Logical cells avoided | 167,753 of 168,000 |
| Sticky axes outside virtual canvas | true |
| Resource-axis / time-axis delta | 0px / 0px |
| Maximum device-pixel placement error | 0 |

The initial 519 key reads are mount-time measurement construction (500 stable resource keys plus the
initial measured range). They occurred before the scroll-frame probe and are intentionally separated
from per-frame counters.

## LTR scroll trace

An eight-step scroll to block offset 14,000 and inline offset 12,000 produced:

| Measurement | Result |
| --- | ---: |
| Scheduled frame samples | 8 |
| React commits | 8 |
| Maximum resource rows / time slots | 25 / 17 |
| Maximum projected cells | 425 |
| Maximum resource-key reads in one sample | 25 of 500 |
| Maximum resource reads in one sample | 50 of 500 |
| Full-resource frame scans | 0 |
| Maximum sticky-axis writes per sample | 2 |
| Final resource-axis / time-axis delta | 0px / 0px |
| Maximum device-pixel placement error | 0 |

The trace read 196 resource keys and 442 resource records across all eight samples. No individual
sample approached the full population. An earlier trace exposed unstable inline callbacks causing
measurement-memo invalidation; stabilizing `getItemKey`, `estimateSize`, `measureElement`, and the
scroll-element accessor reduced the browser trace to the bounded values above.

The preview ran as a background automation tab, where animation frames are timer-throttled. The
reported callback duration is therefore not a frame-budget benchmark; the acceptance evidence is
the instrumented work bound and absence of a 500-item scan.

## RTL, sticky axes, and focus

- In RTL, the viewport and time-axis native offsets both ended at `scrollLeft = -8000`.
- The RTL trace rendered at most 25 resource rows × 17 time slots (425 cells), with zero axis drift,
  two axis writes per sample, zero device-pixel error, and zero full-resource scans.
- `focusResource(239)` focused stable ID `resource-240`. Dispatching Arrow Down focused
  `resource-241`.
- Scrolling to block offset 16,000 removed resource 241 from the DOM (first rendered row became
  `resource-411` and focus temporarily returned to the body). Scrolling back to offset 8,980
  remounted the range at `resource-229` and restored focus to `resource-241`.

The automation connector's structured evaluation endpoint supplied these measurements. Its snapshot
and recording endpoints timed out in this run, so there is no reliable video artifact; the focused
browser state, SSR/hydration tests, and production-build outputs are the durable evidence instead.

## Automated evidence

`vp test --run` covers:

- deterministic repeated LTR and RTL server markup with bounded initial virtual ranges;
- exact StrictMode hydration with no recoverable or console errors;
- focus identity across an off-window/on-window cycle;
- stable domain keys and 500-resource fixtures;
- two constant-time sticky-axis writes;
- device-pixel snapping at scale 1, 1.25, 1.5, 2, and 3;
- positive controls proving the instrumentation flags both a 500-key scan and a 500-record scan.

## Review follow-up: rendered pixels and direction transitions

After review feedback, the production build was rechecked in the same Chromium environment at DPR
2 from a nonzero logical inline offset of 12,000px:

- LTR rendered visible headers `slot-124` through `slot-134` with viewport and time-axis
  `scrollLeft = 12000`.
- Switching to RTL preserved the same visible headers and produced synchronized native offsets of
  `-12000`; switching back to LTR restored synchronized offsets of `12000` and the same headers.
- All three settled states reported zero axis drift and zero rendered device-pixel error.
- The browser probe now reads actual `getBoundingClientRect()` start and end boundaries against
  `window.devicePixelRatio`. As a positive control, translating one rendered header by 0.25 CSS px
  at DPR 2 produced a 0.5-device-pixel error, set `devicePixelPlacementAligned` to false, and caused
  `assertDevicePixelPlacement()` to throw. The temporary translation was removed after the probe.
