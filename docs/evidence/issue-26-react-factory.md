# Issue #26 typed factory and custom-view evidence

- Date: 2026-08-15
- Issue: [#26](https://github.com/Moltenship/time/issues/26)
- Packages: `@moltenship/calendar-react`, `@moltenship/calendar`

## Implemented contract

- `createCalendar<TEvent, TResource, ...>()` carries application records, inferred branded IDs,
  semantic state, actions, meta, event render callbacks, and view renderers without consumer casts.
- `defineCalendarView()` and factory-local `defineView()` bind pure core strategies, immutable
  default options, capabilities, navigation/title behavior, and React renderers.
- Immutable factory/root view registries use deterministic last-registration-wins behavior and
  report duplicate names without logging.
- `Root` owns one compound context. Hooks and custom controls work anywhere below it; `Frame` is
  markup rather than a nested provider.
- Internal semantic contexts keep selector-only controls isolated from unrelated state-slice
  commits while preserving the full typed `useCalendar()` contract for view renderers.
- Headless frame, toolbar, viewport, title, navigation, today, view-switcher, active/custom-view,
  and indexed event primitives use structural composition instead of visual boolean props.
- React 19 DOM refs are direct props and compose with the same part refs exposed through `meta`.
  IDs derive from `useId` and connect controls to the viewport deterministically.
- Immutable capabilities and diagnostics expose active-view, explicit-now, duplicate-view,
  unregistered-view, and invalid-event state through public contracts.
- The supported facade re-exports core and React contracts behind a preserved client boundary. A
  consumer fixture implements a third-party view using package roots only.
- Local React-package and SSR-fixture source imports use `.js` ESM specifiers rather than TypeScript
  extensions. SSR command fixtures run through Vitest's source resolver.

`architecture.md` remains normative. `IMPLEMENTATION_PLAN.md` did not change because issue scope and
dependency sequencing remain unchanged; GitHub's native issue relationships continue to hold the
live execution state.

## Focused gate

`vp run react:factory` passed:

- `calendar-react`: 4 test files and 14 tests;
- public facade: 1 third-party custom-view test;
- both package checks and production builds;
- no consumer cast or private source import;
- no public Jotai contract or `forwardRef` wrapper;
- deterministic React IDs and direct-ref coverage;
- production React entry: 24,333 bytes raw / 5,292 bytes gzip, below the enforced 28 KiB / 6.25
  KiB budget.

## SSR/hydration artifact

`vp run ssr:smoke` rendered the public facade and factory with explicit locale, timezone, week
rules, anchor, and instant. It produced:

```json
{
  "serverHtmlSha256": "2a3db2afe503b8e20a54486c7b23f0af271c2ce26760e5bf506b808fa38cf0cd",
  "recoverableErrors": [],
  "hydratedWithoutMutation": true,
  "interactionCount": 1,
  "unmounted": true
}
```

The full `ssr-fixture` suite also passed three tests. Its known-bad locale-divergence and
module-scope `window` fixtures exited non-zero inside subprocesses for the intended hydration and
server-import reasons.

This issue changes a headless API rather than a styled visual surface, so deterministic
SSR/hydration is its runtime artifact; browser screenshots and visual accessibility scans remain
owned by the downstream integrated React gate and source-view issues.

## Repository gates

| Command | Result |
| --- | --- |
| `vp install` | Lockfile current; supply-chain policy passed |
| `vp check` | 204 files formatted; 148 files with no lint or type errors |
| `vp test` | 27 files and 148 tests passed; one intentional fixture skipped |
| `vp run -r build` | 23 of 23 recursive build tasks passed |
| `vp run ssr:smoke` | Stable hash, no recovery, no mutation, one interaction, clean unmount |
| `git diff --check` | Passed |
